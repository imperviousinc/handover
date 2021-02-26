'use strict';

const ethers = require('ethers');
const {encoding} = require('hsd/node_modules/bns');
const credentials = require('../conf/infura.json');

const ENS_ADDRESS = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
const ENS_ABI = [
    'function setOwner(bytes32 node, address owner) external @500000',
    'function setSubnodeOwner(bytes32 node, bytes32 label, address owner) external @500000',
    'function setResolver(bytes32 node, address resolver) external @500000',
    'function owner(bytes32 node) external view returns (address)',
    'function resolver(bytes32 node) external view returns (address)'
];
const RESOLVER_ABI = [
    'function interfaceImplementer(bytes32 nodehash, bytes4 interfaceId) view returns (address)',
    'function addr(bytes32 nodehash) view returns (address)',
    'function setAddr(bytes32 nodehash, address addr) @500000',
    'function name(bytes32 nodehash) view returns (string)',
    'function setName(bytes32 nodehash, string name) @500000',
    'function text(bytes32 nodehash, string key) view returns (string)',
    'function setText(bytes32 nodehash, string key, string value) @500000',
    'function contenthash(bytes32 nodehash) view returns (bytes)',
    'function setContenthash(bytes32 nodehash, bytes contenthash) @500000',
    'function ABI(bytes32 node, uint256 contentType) view returns (uint256, bytes)',
    'function dnsRecord(bytes32 node, bytes32 name, uint16 resource) view returns (bytes)',
    'function hasDNSRecords(bytes32 node, bytes32 name) view returns (bool)'
];

class Ethereum {
  constructor() {
    this.keccak256 = ethers.utils.keccak256;
    this.namehash = ethers.utils.namehash;
    this.infura = new ethers.providers.InfuraProvider('homestead', credentials);

    this.ensRegistry = new ethers.Contract(ENS_ADDRESS, ENS_ABI, this.infura);
    this.ensResolver = null;
  }

  async init() {
    this.ensResolver = await this.getEnsResolver('eth');
  }

  async getEnsResolver(name) {
    return this.getResolverFromRegistry(name, this.ensRegistry);
  }

  // TODO: cache these
  async getResolverFromRegistry(name, registry) {
    const resolverAddr = await registry.resolver(this.namehash(name));
    return new ethers.Contract(resolverAddr, RESOLVER_ABI, this.infura);
  }

  getAbstractEnsRegistry(address) {
   return new ethers.Contract(address, ENS_ABI, this.infura);
  }

  async resolveEnsAddress(name) {
    return this.infura.resolveName(name);
  }

  // https://eips.ethereum.org/EIPS/eip-634
  async resolveEnsText(name, key) {
    const nameResolver = await this.infura.getResolver(name);

    if (!nameResolver)
      return null;

    return nameResolver.getText(key);
  }

  async resolveDnsFromEns(name, type, node) {
    if (!node)
      node = name;

    const resolver = await this.getEnsResolver(this.trimDot(node));
    const record = await resolver.dnsRecord(
      this.namehash(this.trimDot(node)),
      this.hashDnsName(name),
      type
    );
    // prefixed with "0x" of course...
    return Buffer.from(record.substr(2), 'hex');
  }

  async resolveDnsFromAbstractEns(name, type, ns, node) {
    if (!node)
      node = name;

    const labels = ns.split('.');

    if (labels.length !== 3)
      return null;

    if (labels[1] !== '_eth')
      return null;

    const addr = labels[0];
    if (addr.length !== 42)
      return null;

    const registry = await this.getAbstractEnsRegistry(addr);
    const resolver = await this.getResolverFromRegistry(
      this.trimDot(node),
      registry
    );
    const record = await resolver.dnsRecord(
      this.namehash(this.trimDot(node)),
      this.hashDnsName(name),
      type
    );

    if (!record)
      return null;

    // prefixed with "0x" of course...
    return Buffer.from(record.substr(2), 'hex');
  }

  async resolveDnsFromRegistry(name, type, registryAddress, node) {
    if (!node)
      node = name;

    const registry = this.getAbstractEnsRegistry(registryAddress);
    const resolver = await this.getResolverFromRegistry(
      this.trimDot(node),
      registry
    );
    const record = await resolver.dnsRecord(
      this.namehash(this.trimDot(node)),
      this.hashDnsName(name),
      type
    );
    // prefixed with "0x" of course...
    return Buffer.from(record.substr(2), 'hex');
  }

  hashDnsName(name) {
    const DNSName = encoding.packName(name);
    return this.keccak256(DNSName);
  }

  trimDot(name) {
    if (name[name.length - 1] === '.')
      return name.slice(0, -1);

    return name;
  }
}

module.exports = Ethereum;
