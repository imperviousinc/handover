/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */
/* eslint no-implicit-coercion: "off" */

'use strict';

// Peer dependency because in the plugin `wire` comes from hsd node
const {wire} = require('bns');
const {BufferReader} = require('bufio');

const Ethereum = require('../lib/ethereum');

describe('lib/ethereum', function () {
  this.timeout(60000);
  let ethereum;

  before(async () => {
    ethereum = new Ethereum();
    await ethereum.init();
  });

  function decodeRecords(data) {
    const records = [];
    const br = new BufferReader(data);
    while (br.left() > 0) {
      records.push(wire.Record.read(br));
    }
    return records;
  }

  it('should resolve ENS address', async () => {
    const addr = await ethereum.resolveEnsAddress('ricmoo.firefly.eth');
    console.log(addr);
  });

  it.skip('should scan for EIP-634 text records', async () => {
    const EIP634 = [
      'avatar', 'description', 'display', 'email', 'keywords', 'mail', 'notice',
      'location', 'phone', 'url', 'com.github', 'com.peepth', 'com.linkedin',
      'com.twitter', 'io.keybase', 'org.telegram'
    ];
    const USERS = [
       'eth', 'brantly.eth', 'vitalik.eth', 'eric.eth', 'defidad.eth',
       'stani.eth', 'nick.eth'
    ];

    for (const user of USERS) {
      for (const field of EIP634) {
        const txt = await ethereum.resolveEnsText(user, field);
        if (txt) {
          console.log(
            user.padEnd(20, ' '),
            field.padEnd(20, ' '),
            txt
          );
        }
      }
    }
  });

  it('should get address for .eth ENS resolver contract', async () => {
    const addr = await ethereum.ensRegistry.resolver(
      ethereum.namehash('eth'),
    );
    // should be 0x30200E0cb040F38E474E53EF437c95A1bE723b2B
    console.log(addr);
  });

  it('should get registrar address from resolver contract', async () => {
    const addr = await ethereum.ensResolver.addr(
      ethereum.namehash('eth')
    );
    console.log(addr);
  });

  it('should resolve EIP-1185 DNS records from ENS', async () => {
    const name = 'fuckingfucker.eth.';
    const namehash = ethereum.namehash(ethereum.trimDot(name));

    const resolverAddr = await ethereum.ensRegistry.resolver(namehash);
    console.log(resolverAddr);

    const resolver = await ethereum.getEnsResolver(ethereum.trimDot(name));
    const hasDns = await resolver.hasDNSRecords(
      namehash,
      ethereum.hashDnsName(name)
    );
    console.log(hasDns);

    const record = await ethereum.resolveDnsFromEns(
      name,
      wire.types.A
    );
    console.log(record.toString('hex'));
    console.log(decodeRecords(record));
  });

  it('should resolve EIP-1185 DNS records from FORKED ENS', async () => {
    const regAddr = '0x36fc69f0983E536D1787cC83f481581f22CCA2A1';
    const reg = ethereum.getAbstractEnsRegistry(regAddr);

    const name = 'certified.badass.';
    const namehash = ethereum.namehash(ethereum.trimDot(name));
    const resolver = await ethereum.getResolverFromRegistry(
      ethereum.trimDot(name),
      reg
    );
    const hasDns = await resolver.hasDNSRecords(
      namehash,
      ethereum.hashDnsName(name)
    );
    console.log(hasDns);

    const record = await ethereum.resolveDnsFromRegistry(
      name,
      wire.types.A,
      regAddr
    );
    console.log(record.toString('hex'));
    console.log(decodeRecords(record));
  });

  it('should resolve EIP-1185 DNS records from FORKED ENS', async () => {
    const name = 'certified.badass.';
    const ns = '0x36fc69f0983E536D1787cC83f481581f22CCA2A1._eth.';

    const record = await ethereum.resolveDnsFromAbstractEns(
      name,
      wire.types.A,
      ns
    );

    console.log(record.toString('hex'));
    console.log(decodeRecords(record));
  });
});
