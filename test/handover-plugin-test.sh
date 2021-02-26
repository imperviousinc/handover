#!/usr/bin/env bash

set -e
export HSD_NETWORK=regtest

hsd \
  --memory=true \
  --network=regtest \
  --plugins=`pwd` \
  --daemon

sleep 2

hsd-rpc generatetoaddress 100 `hsw-rpc getnewaddress` > /dev/null
hsw-rpc sendopen badass > /dev/null
hsd-rpc generatetoaddress 10 `hsw-rpc getnewaddress` > /dev/null
hsw-rpc sendbid badass 1 1 > /dev/null
hsd-rpc generatetoaddress 10 `hsw-rpc getnewaddress` > /dev/null
hsw-rpc sendreveal > /dev/null
hsd-rpc generatetoaddress 10 `hsw-rpc getnewaddress` > /dev/null
hsw-rpc sendupdate badass '{"records":[{"type":"NS", "ns":"0x36fc69f0983E536D1787cC83f481581f22CCA2A1._eth."}]}' > /dev/null
hsd-rpc generatetoaddress 10 `hsw-rpc getnewaddress` > /dev/null
hsw-rpc getnameresource badass

echo "WITH UNBOUND:"
dig @127.0.0.1 -p 25350 certified.badass
dig @127.0.0.1 -p 25350 fuckingfucker.eth

hsd-rpc stop

hsd \
  --memory=true \
  --network=regtest \
  --plugins=`pwd` \
  --rs-no-unbound \
  --daemon

sleep 2

hsd-rpc generatetoaddress 100 `hsw-rpc getnewaddress` > /dev/null
hsw-rpc sendopen badass > /dev/null
hsd-rpc generatetoaddress 10 `hsw-rpc getnewaddress` > /dev/null
hsw-rpc sendbid badass 1 1 > /dev/null
hsd-rpc generatetoaddress 10 `hsw-rpc getnewaddress` > /dev/null
hsw-rpc sendreveal > /dev/null
hsd-rpc generatetoaddress 10 `hsw-rpc getnewaddress` > /dev/null
hsw-rpc sendupdate badass '{"records":[{"type":"NS", "ns":"0x36fc69f0983E536D1787cC83f481581f22CCA2A1._eth."}]}' > /dev/null
hsd-rpc generatetoaddress 10 `hsw-rpc getnewaddress` > /dev/null
hsw-rpc getnameresource badass

echo "--"
echo "NO UNBOUND:"
dig @127.0.0.1 -p 25350 certified.badass
dig @127.0.0.1 -p 25350 fuckingfucker.eth

hsd-rpc stop