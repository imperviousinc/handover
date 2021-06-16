# Handover

A plugin for `hsd` to enable DNS resolution on external networks like Ethererum.

## Installation & Usage

Before installing, you need an Infura API key. Go to infura.io, create a new
project and get a free API key. The plugin requires master branch of `hsd`
(currently unreleased). 

```
cd /path/to/hsd

# install the plugin
npm install imperviousinc/handover
```

Your Infura credentials can be passed to the plugin in the same way(s) as all
other `hsd` configuration parameters:

Command line:

```
hsd \
 --plugins=handover \
 --handover-provider=infura
 --handover-infura-projectid=<...> \
 --handover-infura-projectsecret=<...>
```

Environment variables:

```
export HSD_HANDOVER_PROVIDER=infura
export HSD_HANDOVER_INFURA_PROJECTID=<...>
export HSD_HANDOVER_INFURA_PROJECTSECRET=<...>
hsd --plugins handover
```

Configuration file:

`~/.hsd/hsd.conf`:

```
handover-provider: infura
handover-infura-projectid: <...>
handover-infura-projectsecret: <...>
plugins: handover
```

You should see this in the log:

```
[info] (handover) handover external network resolver plugin is active.
```

Try it out!

Resolve an ENS name directly without Handshake:

```
$ dig @127.0.0.1 -p 5350 fuckingfucker.eth +short
184.73.82.1
```

Resolve a decentralized subdomain of a Handshake TLD:

```
$ dig @127.0.0.1 -p 5350 certified.badass +short
184.73.82.1
```

## Resolving HNS names on Ethereum

See [HIP-0005](https://github.com/handshake-org/HIPs/pull/10) for more details.

Notice how the NS record was set for this Handshake domain:

```
$ hsd-rpc getnameresource badass

{
  "records": [
    {
      "type": "NS",
      "ns": "0x36fc69f0983E536D1787cC83f481581f22CCA2A1._eth."
    }
  ]
}
```

The `_eth` TLD indicates an abstract (forked) ENS contract on Ethereum, appended
to the contract's address. On Ethereum, the domain `certified.badass` was registered
with this contract, and its DNS records were set using [EIP-1185](https://eips.ethereum.org/EIPS/eip-1185):

```
$ node

> const {wire} = require('bns')
> wire.Record.fromJSON({name:'certified.badass.', ttl: 60000, class: 'IN', type: 'A', data: {address: '184.73.82.1'}}).encode().toString('hex')
'096365727469666965640662616461737300000100010000ea600004b8495201'
```

## Using a local Ethereum provider

To use a local Etherum node over JSON-RPC instead of Infura, use these configuration options instead.

* `handover-jsonrpc-ens-address` is an ethereum address for the ENS registry to use when resolving '.eth' requests.
* `handover-jsonrpc-url` (optional) specify the jsonrpc connection url. If not provided, will use the ethersjs default.

Command line:

```
hsd \
 --plugins=handover \
 --handover-provider=jsonrpc \
 --handover-jsonrpc-url=<...> \
 --handover-jsonrpc-ens-address=<...>
``` 

Environment variables:

```
export HSD_HANDOVER_INFURA_PROJECTID=<...>
export HSD_HANDOVER_INFURA_PROJECTSECRET=<...>
hsd --plugins handover
```

Configuration file:

`~/.hsd/hsd.conf`:

```
handover-provider: jsonrpc
handover-jsonrpc-url: <...>
handover-jsonrpc-ens-address: <...>
plugins: handover
```

## Explanation

When `hsd` is run with this plugin, a middleware function is added to the HNS root
resolver that intercepts queries as they come in. If the query is rooted in either
`.eth` or `._eth` TLD, the name is resolved directly using ENS, bypassing Handshake.

Otherwise, HNS resolution proceeds normally. However, the results are inspected
by the plugin before being returned. If a domain has an NS record rooted in either
`.eth` or `._eth`, the plugin uses the NS address and the original query string
to resolve the user's request on Ethereum. If an answer is found there, it is
sent back to the recursive resolver.

There is one more complication which is that recursive resolvers (like unbound)
may have `qname-minimisation` set, which means the resolver begins its recursion
by ONLY querying the TLD (as opposed to sending the full query string). To deal
with this, if the plugin detects a NS pointing to `.eth` or `._eth` but does
not have a full query string (i.e. only one label, `.badass`) the plugin returns
an empty response with SOA. This tricks the recursive resolver into making a new
request with the full query string (i.e. `certified.badass`).

## Future Work

There's still a lot "TODO":

More config options: Support running against live testnets, without a '.ens' resolver
(to simplify testing), etc.

Cache: The Ethereum interface should cache "resolver" and "registry" contract
objects instead of requesting them from the Ethereum provider on each query.

Additional ENS types: This plugin currently only supports resolving of EIP-1185
data (aka "actual DNS records on ENS") but ENS itself has support for many
abstract data types like [content hashes](https://eips.ethereum.org/EIPS/eip-1577)
and a special type of [text record](https://eips.ethereum.org/EIPS/eip-634) that
requires a key to resolve. An example of a set of these text records with their keys:

```
brantly.eth          avatar               https://i.imgur.com/JcZESMp.png
brantly.eth          description          "If anyone would come after me, let him deny himself and take up his cross daily and follow me. For whoever would save his life will lose it, but whoever loses his life for my sake will save it. For what does it profit a man if he gains the whole world and loses or forfeits himself?" - Jesus, Luke 9.23-25
brantly.eth          email                me@brantly.xyz
brantly.eth          keywords             catholic, ens, oregon, seinfeld, books
brantly.eth          notice               Not for sale
brantly.eth          url                  http://brantly.xyz/
```

Subdomains: The plugin has not been tested on sub domains of names registered
at the ENS contract root (e.g. `whynot.fuckingfucker.eth` or `yesiam.certified.badass`).

## Development

To contribute or modify this plugin you can install it in a different working
directory with git, but it must be linked into hsd correctly to work:

```
git clone https://github.com/imperviousinc/handover
cd handover
npm install

cd /path/to/hsd/repo
ln -s /path/to/handover /node_modules

export NODE_PRESERVE_SYMLINKS=1

hsd --plugins handover
```

If you need `sudo` to listen on port `53`:

```
export NODE_PRESERVE_SYMLINKS=1
sudo -E hsd --plugins handover --rs-port 53
```

## Testing

Run unit tests: `npm run test`

Run integration test:

```
cd /path/to/hsd

node_modules/handover/test/handover-plugin-test.sh
```

## Credit

This plugin relies on the [ethers.js](https://github.com/ethers-io/ethers.js/) library.

Inspiration comes from [hsd-ens-resolution](https://github.com/tynes/hsd-ens-resolution)
by the very handsome and super-friendly [@tynes](https://github.com/tynes).

Thanks to [@rithvikvibhu](https://github.com/rithvikvibhu) for the name "handover".
