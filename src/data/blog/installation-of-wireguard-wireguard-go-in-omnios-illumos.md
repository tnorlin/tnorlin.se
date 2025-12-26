---
title: Installation of wireguard (wireguard-go) in OmniOS (illumos)
author: Tony Norlin
featured: true
description: "A short note on installing wireguard onto a non-global zone in illumos."
pubDatetime: 2023-09-03T14:13:51.279Z
draft: false
tags: [omnios, illumos, wireguard, networking, security]
---

![Photo of a red onion.](/assets/red_onion.jpeg)_Photo of a red onion._

## Background

I've, since a couple of years back, separated my OOB (Out Of Bands) network by putting one of my old routers into place as the means of terminating inbound traffic, and then installed VPN and allowed inbound NAT from approved networks.

This solution has served me pretty well through out the years and brought a decent level of security (after all, this is just an ordinary household), but it's still been another device to be supervised, powered powered on (and maintained).<br />
Although it hasn't brought me any issues, I felt that I've been procastrinating this setup long enough yesterday. I were in the midst of locating the ILO interface to one machine that's been collecting dust for a while when I realized that it was about time to fix it.

The notes here, are for the secondary wireguard node (the primary node has been up for a day already and my Mikrotik router is powered down, decomission will start shortly)...

## Topology

The OOB network is segmented on a dedicated virtual network, reachable from switch ports that have that VLAN tagged and through the external Mikrotik firewall. With my revision, it will be reachable either through the switch ports or wireguard for select clients (me).

## Global Zone Requirements

Any native zone brand will do, but I've chosen lipkg. The zone can be setup with the ordinary `zonecfg` command, but since a couple of years I've favored the `zadm` command due to it's simplicity and json format. Then due to implementation of a tunnel, the `tuntap` interface (driver) needs to be installed.

    $ pfexec pkg install system/zones/brand/lipkg ooce/util/zadm driver/tuntap

## Create the zone.

Necessary parameters:

    GLOBALNIC=aggr0 # Global interface, aggregation to be preferred.
    INTWGNIC=oobwg2int0 # interface within OOB VLAN
    INTWGVID=<VLANID> # OOB VLAN ID
    # Create as many interfaces as necessary..
    EXTWGNIC=oobwg2ext0 # interface for clients
    EXTWGVID=<VLANID> # Client VLAN ID
    NS= ['NS1', 'NS2', 'NS3']

Create the configuration:

    cat << EOF > /var/tmp/oobwg2.json
    {
       "autoboot" : "true",
       "bootargs" : "",
       "brand" : "lipkg",
       "cpu-shares" : "1",
       "device" : [
          {
             "match" : "/dev/tun"
          }
       ],
       "fs-allowed" : "",
       "hostid" : "",
       "ip-type" : "exclusive",
       "limitpriv" : "default",
       "net" : [
          {
             "global-nic" : "${GLOBALNIC}",
             "physical" : "${INTWGNIC}",
             "vlan-id" : "${INTWGVID}"
          },
          {
             "global-nic" : "${GLOBALNIC}",
             "physical" : "${EXTWGNIC}",
             "vlan-id" : "${EXTWGVID}"
          }
       ],
       "pool" : "",
       "resolvers" : ${NS},
       "scheduling-class" : "",
       "zonename" : "oobwg2",
       "zonepath" : "/zones/oobwg2"
    }
    EOF

Create the zone (and boot it). Sleep optional, but hopefully all necessary are done by then. Check with `svcs`:

    $ pfexec zadm create -b lipkg oobwg2 < /var/tmp/oobwg2.json

    $ pfexec zadm boot oobwg2 && sleep 20 && zlogin oobwg2

    $ svcs -xv

## Non-global zone operations

The security conscious person will begin to setup the log destination(s) and dedicated users, but in order to not have (another) novel, it has been left out to the reader.

Here will be shown (chown ;-) ) actions as root.

As the OOB is mostly used while issues on the ordinary network, it may seem like a wise idea to assign static addresses on the interfaces:

    # ipadm create-addr -T static -a ${IPV4ADDRESS} oobwg2int0/v4

For the one's trusting in DHCP even on rainy days:

    # ipadm create-addr -T dhcp oobwg2lan0/v4

As in an ideal world, the wireguard peer won't reach the Internet or other destinations than the designated ones, image repositories are out of scope. Check / correct publisher, define proxies etc.):

    # pkg publisher

For this peer we need to have one package installed:

    # pkg install pkg:/ooce/network/wireguard-tools

## Setup wireguard

    # umask 077
    # wg genkey | tee privatekey | wg pubkey > publickey

    WGCIDR=172.22.0.1/24
    WGPORT=51820
    # cat << EOF > /etc/opt/ooce/wireguard/tun0.conf
    [Interface]
    Address = ${WGCIDR}
    PrivateKey = $(cat privatekey)
    ListenPort = ${WGPORT}

    EOF

Create the configuration at the client device with the help of this information:

    $ ipadm show-addr -p -o addr oobwg2ext0/v4
    $ cat publickey

    CLIENTIP=172.22.0.2/32 # <Client's allowed IP>
    CLIENTKEY=< the clients PUBLIC key>

From the client configuration, generate the peer part of the wireguard configuration

    # cat << EOF >> /etc/opt/ooce/wireguard/tun0.conf
    [Peer]
    PublicKey = ${CLIENTKEY}
    AllowedIPs = ${CLIENTIP}
    EOF

`wg-quick` looks for information in /etc/wireguard/ directory, thus we create it

    mkdir /etc/wireguard && ln -sf /etc/opt/ooce/wireguard/tun0.conf /etc/wireguard/tun0.conf

Test the setup with:

    wg-quick up tun0

In the unfortunate event that it doesn't work, rename the interface to the expected value (tun1?) and do the same below with the service definition.

Clean up the tunnel (reboot the zone?) and create the service as below.

    # cat <<EOF>> /var/svc/manifest/network/wireguard.xml
    <?xml version="1.0"?>
    <!DOCTYPE service_bundle SYSTEM "/usr/share/lib/xml/dtd/service_bundle.dtd.1">
    <!--
        Manifest automatically generated by smfgen.
     -->
    <service_bundle type="manifest" name="network-wireguard" >
        <service name="network/wireguard" type="service" version="1" >
            <create_default_instance enabled="true" />
            <dependency name="dep1" grouping="require_all" restart_on="error" type="service" >
                <service_fmri value='svc:/network/ipfilter:default' />
                <service_fmri value='svc:/network/physical:default' />
                <service_fmri value='svc:/network/ipv4-forwarding:default' />
            </dependency>
            <exec_method type="method" name="start" exec="/opt/ooce/bin/wg-quick up tun0&amp;" timeout_seconds="10" />
            <exec_method type="method" name="stop" exec=":kill" timeout_seconds="30" />
            <template >
                <common_name >
                    <loctext xml:lang="C" >Wireguard Service</loctext>
                </common_name>
            </template>
        </service>
    </service_bundle>
    EOF

    svccfg import /var/svc/manifest/network/wireguard.xml

If everything went as planned, a `svcs -H -o state  wireguard ` will have the output `online`.

To have packets be able to traverse from client VLAN to OOB VLAN, IP forwarding needs to be enabled. Fortunately that is rather easy:

    svcadm enable network/ipv4-forwarding network/ipfilter

IP Filter (firewall ) is out of scope, but it would make sense to only allow UDP traffic in to the designated wireguard port, and then only allow traffic to (syslog destinations and) the OOB VLAN and keep the state back to the client that initiated the traffic.

To let the traffic through, it needs to be rewritten so that the source address of the wireguard network instead be that one of the peer it exits:

    WGNETCIDR=172.22.0.0/24 #the NETWORK CIDR of WG network
    cat <<EOF> /etc/ipf/ipnat.conf
    map oobwg2int0 ${WGNETCIDR} -> 0/32 portmap tcp/udp auto #*
    map oobwg2int0 ${WGNETCIDR} -> 0/32
    EOF

Initiate traffic and check (troubleshoot) with:

    svcadm enable network/ipfilter
    svcs -xv
    ipnat -l
