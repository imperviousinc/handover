'use strict';

const axios = require('axios').default;
const { Zone } = require('bns');
const LRU = require('blru');

class Sia {
  constructor({ logger, portal }) {
    this.logger = logger;
    this.cache = new SiaCache();

    const match = portal.match(/(?:https?\:\/\/)?([\w\.\-_]+)\/?/i);
    if (match) this.portal = match[1];
    else this.logger.error('Invalid portal.');
  }

  async resolveDnsFromSkylink(name, type, ns, node) {
    this.logger.debug('Resolving', name, type, ns);
    if (!node) node = name;

    const labels = ns.split('.');

    if (labels.length !== 3) return null;
    if (labels[1] !== '_sia') return null;

    const skylink = labels[0];
    if (skylink.length !== 46) return null;

    const skylinkContent = await this.getSkylinkContent(skylink);
    return this.resolveDnsFromZone(skylinkContent, name, type);
  }

  async resolveDnsFromRegistry(name, type, ns, node) {
    this.logger.debug('Resolving from Registry: ', name, type, ns);
    if (!node) node = name;

    const labels = ns.split('.');

    if (labels.length !== 7) return null;
    if (labels[5] !== '_siaregistry') return null;

    // Pubkey and datakey are split into 2 labels of 32 bytes each because of max label length
    const algo = labels[0];
    const pubKey = labels[1] + labels[2];
    const dataKey = labels[3] + labels[4];
    if (algo.length <= 0 || pubKey.length !== 64 || dataKey.length !== 64)
      return null;

    const registryData = await this.getRegistryEntry(algo, pubKey, dataKey);
    const skylinkContent = await this.getSkylinkContent(registryData);
    return this.resolveDnsFromZone(skylinkContent, name, type);
  }

  async getSkylinkContent(skylink) {
    const item = this.cache.get(skylink);
    if (item) return item;

    const skylinkContent = await this._getSkylinkContent(skylink);
    this.cache.set(skylink, skylinkContent);
    return skylinkContent;
  }

  async _getSkylinkContent(skylink) {
    this.logger.debug('Fetching skylink...', skylink);
    const content = await axios({
      url: `https://${this.portal}/${skylink}`,
      responseType: 'text',
      transformResponse: [
        (data) => {
          return data;
        },
      ], // force text response: https://github.com/axios/axios/issues/907
      maxBodyLength: 20000, // in bytes
    });
    this.logger.spam(content.data);
    return content.data;
  }

  async getRegistryEntry(algo, pubKey, dataKey) {
    const key = `${pubKey};${dataKey}`;
    const item = this.cache.get(key);
    if (item) return item;

    const registryEntry = await this._getRegistryEntry(algo, pubKey, dataKey);
    this.cache.set(key, registryEntry);
    return registryEntry;
  }

  async _getRegistryEntry(algo, pubKey, dataKey) {
    this.logger.debug('Fetching sia registry...', algo, pubKey, dataKey);
    const content = await axios({
      url: `https://${this.portal}/skynet/registry?publickey=${algo}:${pubKey}&datakey=${dataKey}`,
      maxBodyLength: 20000, // in bytes
    });
    this.logger.spam(content.data);
    return Buffer.from(content.data.data, 'hex').toString();
  }

  async resolveDnsFromZone(zoneContent, name, type) {
    const zone = new Zone();

    try {
      zone.fromString(zoneContent);
    } catch (error) {
      if (error.type !== 'ParseError') this.logger.error(error);
      return null;
    }

    this.logger.spam(zone);
    const records = zone.get(name, type).map((rec) => rec.toRaw());
    if (!records.length) return null;

    return Buffer.concat(records);
  }
}

class SiaCache {
  constructor(size = 3000) {
    this.cache = new LRU(size);
    this.CACHE_TTL = 30 * 60 * 1000;
  }

  set(key, data) {
    this.cache.set(key, {
      time: Date.now(),
      data,
    });

    return this;
  }

  get(key) {
    const item = this.cache.get(key);

    if (!item) return null;

    if (Date.now() > item.time + this.CACHE_TTL) return null;

    return item.data;
  }

  reset() {
    this.cache.reset();
  }
}

module.exports = Sia;
