/*!
 * handover.js - External-network resolver plugin for hsd
 * Copyright (c) 2021 Matthew Zipkin (MIT License).
 */

'use strict';

const {wire, util} = require('bns');
const {BufferReader} = require('bufio');
const Ethereum = require('./ethereum');

const plugin = exports;

class Plugin {
  constructor(node) {
    this.ready = false;
    this.node = node;
    this.ns = node.ns;
    this.logger = node.logger.context('handover');

    this.ethereum = new Ethereum({
      projectId: node.config.str('handover-infura-projectid'),
      projectSecret: node.config.str('handover-infura-projectsecret')
    });

    // Plugin can not operate if node doesn't have DNS resolvers
    if (!this.ns || !this.node.rs)
      return;

    // Middleware function that intercepts queries to root
    // before cache, blocklist or HNS lookup
    this.ns.middle = async (tld, req) => {
      if (!this.ready)
        return null;

      const [qs] = req.question;
      const name = qs.name.toLowerCase();
      const type = qs.type;
      const labels = util.split(name);

      // The plugin can resolve direct queries for ENS (.eth) names,
      // but we must get the complete query string from the recursive resolver.
      // That way we don't need to run a separate authoritative nameserver.
      // If the recursive is "minimizing query names" and only requesting a
      // referral for the TLD, we claim authority so it sends us the full name.
      let data;
      switch (tld) {
        case 'eth.':
          if (labels.length < 2) {
            if (type === wire.types.DS) {
              // TODO: plugin should have ephemeral DNSSEC keys.
              // We should return that here, signed by HNS root ZSK.
            } else {
              return this.sendSOA(name);
            }
          } else {
            data = await this.ethereum.resolveDnsFromEns(name, type);
            return this.sendData(data);
          }
          break;
        case '_eth.':
          if (type === wire.types.DS) {
            // TODO: plugin should have ephemeral DNSSEC keys.
            // We should return that here, signed by HNS root ZSK.
          } else {
            return this.sendSOA(name);
          }
          break;
      }

      // Next, try actually resolving the name with the HNS root zone.
      // We are going to examine the result before sending it back.
      const res = await this.resolveHNS(req, name, type, tld);

      // If there's no NS records, we're done, plugin is bypassed.
      if (!res.authority.length)
        return res;

      // Check NS records for referals to TLDs `.eth` and `._eth`
      for (const rr of res.authority) {
        if (rr.type !== wire.types.NS)
          continue;

        // Look up the ENS resolver specified in the NS record
        // and query it for the user's original request
        if (rr.data.ns.slice(-5) === '.eth.') {
          // If the recursive is being minimal, don't look up the name.
          // Send the SOA back and get the full query from the recursive .
          if (labels.length < 2) {
            return this.sendSOA(name);
          }
          this.logger.debug(
            'Intercepted referral to .eth: %s %s -> NS: %s',
            name,
            wire.typesByVal[type],
            rr.data.ns
          );
          data = await this.ethereum.resolveDnsFromEns(
            name,
            type,
            rr.data.ns
          );
        }

        // Look up an alternate (forked) ENS contract by the Ethereum
        // address specified in the NS record, and query it for
        // the user's original request
        if (rr.data.ns.slice(-6) === '._eth.') {
          // If the recursive is being minimal, don't look up the name.
          // Send the SOA back and get the full query from the recursive .
          if (labels.length < 2) {
            return this.sendSOA(name);
          }
          this.logger.debug(
            'Intercepted referral to ._eth: %s %s -> %s NS: %s',
            name,
            wire.typesByVal[type],
            rr.name,
            rr.data.ns
          );
          data = await this.ethereum.resolveDnsFromAbstractEns(
            name,
            type,
            rr.data.ns
          );
        }
      }

      // If the Ethereum stuff came up empty, return the
      // HNS root server response unmodified.
      if (!data || data.length === 0)
        return res;

      // If we did get an answer from Ethereum, mark the response
      // as authoritative and insert the new answer.
      this.logger.debug('Inserting answers from alternate naming system');
      res.aa = true;
      const br = new BufferReader(data);
      while (br.left() > 0) {
        res.answer.push(wire.Record.read(br));
      }

      // TODO: plugin should have ephemeral DNSSEC keys for its two zones.
      // Answers resolved from Ethereum should be signed by those keys
      // since they will appear to come from the .eth or ._eth zones.

      // Send back the doctored response
      // TODO: cleaner operation here would be to replace the HNS
      // response with our answer instead of throwing an answer on top
      // of the HNS referral.
      return res;
    };
  }

  async open() {
    this.logger.error('handover external network resolver plugin installed.');

    // The first thing this plugin wants to do when it's opened is
    // contact https://mainnet.infura.io/. Of course, if this instance
    // of hsd is being used to resolve DNS for the system it is running on,
    // that is not yet possible at this point in the hsd life cycle!
    // The best we can do is wait for this event from the recursive resolver,
    // and even then we still need to give it another second before we
    // can resolve DNS with... ourself.
    this.node.rs.on('listening', async () => {
      await new Promise(r => setTimeout(r, 1000));
      await this.ethereum.init();
      this.ready = true;
      this.logger.error(
        'handover external network resolver plugin is active!'
      );
    });
  }

  close() {
    this.ready = false;
  }

  // Copy hsd's server.resolve() to lookup a name on HNS normally
  async resolveHNS(req, name, type, tld) {
    let res = null;
    // Check the root resolver cache first
    const cache = this.ns.cache.get(name, type);

    if (cache) {
      res = cache;
    } else {
      res = await this.ns.response(req);
      // Cache responses
      if (!util.equal(tld, '_synth.'))
        this.ns.cache.set(name, type, res);
    }
    return res;
  }

  // Copy from the end of hsd's server.response() to send
  // SOA-only when we don't have / don't want to answer.
  async sendSOA(name) {
    let serial = 0;
    const date = new Date();
    serial += date.getUTCFullYear() * 1e6;
    serial += (date.getUTCMonth() + 1) * 1e4;
    serial += date.getUTCDate() * 1e2;
    serial += date.getUTCHours();

    const rd = new wire.SOARecord();
    rd.ns = name;
    rd.mbox = name;
    rd.serial = serial;
    rd.refresh = 1800;
    rd.retry = 900;
    rd.expire = 604800;
    rd.minttl = 86400;

    const rr = new wire.Record();
    rr.name = name;
    rr.type = wire.types.SOA;
    rr.ttl = 86400;
    rr.data = rd;

    const res = new wire.Message();
    res.authority.push(rr);
    this.ns.signRRSet(res.authority, wire.types.SOA);
    return res;
  }

  // Convert a wire-format DNS record to a message and send.
  sendData(data) {
    const res = new wire.Message();
    res.aa = true;
    const br = new BufferReader(data);
    while (br.left() > 0) {
      res.answer.push(wire.Record.read(br));
    }
    return res;
  }
}

plugin.id = 'handover';
plugin.init = function init(node) {
  return new Plugin(node);
};
