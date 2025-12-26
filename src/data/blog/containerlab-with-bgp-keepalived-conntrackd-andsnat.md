---
title: Containerlab with BGP, keepalived, conntrackd and SNAT
author: Tony Norlin
description: "A simple how-to on BGP routing with SNAT, keepalived, conntrackd together with FRR and Containerlab that relies on docker containers."
pubDatetime: 2023-10-15T15:50:15.922Z
draft: false
tags: [containerlab, networking, bgp, conntrackd, keepalived, snat, kind]
---

![Graph from Containerlab](/assets/containerlab-graph.png)_Graph from Containerlab_

## Background story

I had a go at [Containerlab](https://containerlab.dev/) after [Nicolas Vibert](https://www.linkedin.com/in/nicolasvibert) posted a nice article about it last year (and those of you that have taken [Isovalent labs](https://isovalent.com/resource-library/labs/) may certainly recognize it). Containerlab relies on docker to spin up a container infrastructure "as code" and have templates for a bunch of networking related simulators.

I do happily have my home infrastructure, aka "homelab", where I run BGP among other components, but there are moments where it's rather nice to just spin up something to test and then forget it. And yes, forget for real. I have a bad habit to leave virtual machines powered of for future reference - then some year later it can be a bit tougher to just delete it. Even if I've marked accounts with expire dates know (by looking) in logs that the vm was untouched ever since, I still have too boot up and confirm the fact that it can just be deleted. With containers in a simulation environment its alot easier as I would never keep anything of long-term importance there.

I've seen how neat Nicolas designed a BGP lab with containerlab and was inspired to one day have a go myself and that arised when I were thinking about a situation of doing SNAT on egress traffic from a shared IP with the help of keepalived and conntrackd from two nodes.

Although I've had my own kind of "Nagle moment" (see below), Im really impressed with the potential of Containerlab and decided to try out other stuff as well.

![Bryan Cantrill tweets about Nagle algorithm](/assets/nagle-tweet.png)_Bryan Cantrill tweets about Nagle algorithm_

## The "Nagle moment", sort of

I'm know for sure that my issue was nowhere as complicated as Oxide's, and it is not really related to Nagle algorithm at all, but for me it was really on the same dimension. It turned out that as I solved the first part in my mission to set up a shared IP, I fixed the SNAT together with conntrackd rather swiftly - which in turn awoke another idea to let the "other site" to have a router acting as the GW out to Internet.

To established the SNAT from site A to site B, I decided to go simple and make the default route on site B back to site A. But this of course causing issues to reach the the container acting as "Internet GW", so I decided to just comment out the line that marked a default route.

As commenting out one line was such a trivial thing and so easy to get back to previous state, I weren't even bothering to create a snapshot/backup/GIT branch and had a go, but the GW on site B wasn't routing outbound traffic from site A and I tried out some tiny changes on FRR before it was time for bed anyway.

Two evenings later I had spare time to proceed with my task, but I forgot where I got stuck and to my horror I couldn't even do SNAT anymore, which led me to three late evening sessions (4–6 hours, almost crying out of frustration), attempting to change back FRR to a state that allowed me to do SNAT again. I could not reach the destination anymore for some reason. Masquerading? No, of course not, that hid the source IP and replaced it with the router's so it had to do with the routing somehow.

I began to look at OSPF - but no, it shouldn't be a requirement and I was certainly not doing that before, so why now? Route-maps? I had really allowed all traffic, but still, was I missing something? EVPN? BFD? Details with the BGP unnumbered peering? Next-hop? No, things I didn't need last time implement to solve my task shouldn't all of sudden be necessary again for just having the SNAT in place.

My head was spinning and I couldnt figure out what tiny changes I possibly could have done that made everything stop working like that out of nowhere. 
Comparing with old copies, looking at the terminal history, terminal scrollback, GIT - everything in my current FRR config looked very similar to what I had configured at the moment. Then I saw it, just a simple pound sign:

![](/assets/bad-comment.png)

Embarassing moment and I felt very nauseas about that comment, and why wouldn't I want to.. now, wait a minut.. so the night before I had a lousy sleep for going to bed without solving the issue and now one night's bad sleep for knowing that I indeed just did a tiny change and not even bothered to look at the stanza for spinning up the containers…

## The start layout

The idea was that one site, connected with redundant BGP nodes, should travel over an unknown network (Internet?) and peer with redundant BGP nodes at the destination site, without bothering with the whole leaf-spine topology and just abstract away that. Plain and simple. Let one node from site A (be SNAT'ed with the shared IP) connect to a node within site B that echoes the source addr.

Site A and B was eventually renamed to int and ext for readability.

## FRR configuration

A bit fat warning on putting these configurations into production, they (FRR instances) will trust neighbors and doesn't watch out for BGP poisoning. You have been warned.

The idea was to look for simplicity and do with BGP unnumberred.

**intbgp1:**

    cat << EOF > conf.d/intbgp1_frr.conf
    !
    frr defaults datacenter
    hostname intbgp1
    log syslog informational
    service integrated-vtysh-config
    ipv6 forwarding
    !
    interface lo
      ip address 10.0.0.2/32
    !
    router-id 10.0.0.2
    !
    router bgp 64502
      bgp bestpath as-path multipath-relax
      bgp bestpath compare-routerid
      no bgp ebgp-requires-policy
      no bgp network import-check

      neighbor intbgp peer-group
      neighbor intbgp remote-as internal
      neighbor eth2 interface peer-group intbgp
      neighbor intbgp update-source eth2

      neighbor extbgp peer-group
      neighbor extbgp remote-as external
      neighbor extbgp capability extended-nexthop
      neighbor eth1 interface peer-group extbgp
      neighbor extbgp update-source eth1
      !
      address-family ipv4 unicast
       network 10.0.0.2/32
       neighbor intbgp activate
       neighbor extbgp activate
       redistribute connected
      exit-address-family
      !
      address-family ipv6 unicast
       neighbor intbgp activate
       neighbor extbgp activate
       redistribute connected
      exit-address-family
    !
    line vty
    !
    end
    EOF

**intbgp2:**

    cat << EOF | patch -o conf.d/intbgp2_frr.conf -p0
    --- conf.d/intbgp1_frr.conf   2023-10-05 11:48:27.734812969 +0200
    +++ conf.d/intbgp2_frr.conf   2023-10-05 11:48:27.734812969 +0200
    @@ -1,14 +1,14 @@
     !
     frr defaults datacenter
    -hostname intbgp1
    +hostname intbgp2
     log syslog informational
     service integrated-vtysh-config
     ipv6 forwarding
     !
     interface lo
    -  ip address 10.0.0.2/32
    +  ip address 10.0.0.3/32
     !
    -router-id 10.0.0.2
    +router-id 10.0.0.3
     !
     router bgp 64502
       bgp bestpath as-path multipath-relax
    @@ -28,7 +28,7 @@
       neighbor extbgp update-source eth1
       !
       address-family ipv4 unicast
    -   network 10.0.0.2/32
    +   network 10.0.0.3/32
        neighbor intbgp activate
        neighbor extbgp activate
        redistribute connected
    EOF

## The extbgp nodes

Ideally the conntrackd and keepalived should be installed on extbgp as well, but I wanted to explore alternatives. As below configuration shows, FRR will keep a shared IP between the two nodes. I'm not sure, but I believe either PBR and send out to a interface that will do the SNAT/Masquerading or some kind of combination with conntrackd (although, I fail to see how to trigger the states from FRR).

**extbgp1:**

    cat << EOF > conf.d/extbgp1_frr.conf
    !
    frr defaults datacenter
    hostname extbgp1
    log syslog informational
    service integrated-vtysh-config
    ipv6 forwarding
    !
    interface lo
      ip address 10.0.0.4/32
      ip address 10.237.0.253/32
    !
    router-id 10.0.0.4
    !
    router bgp 64503
      bgp bestpath as-path multipath-relax
      bgp bestpath compare-routerid
      no bgp ebgp-requires-policy
      no bgp network import-check
      no bgp default ipv4-unicast

      neighbor extbgp peer-group
      neighbor extbgp remote-as internal
      neighbor eth2 interface peer-group extbgp
      neighbor extbgp update-source eth2

      neighbor intbgp peer-group
      neighbor intbgp remote-as external
      neighbor intbgp capability extended-nexthop
      neighbor eth1 interface peer-group intbgp
      neighbor intbgp update-source eth1
      !
      address-family ipv4 unicast
       network 10.0.0.4/32
       network 10.237.0.0/24
       neighbor intbgp activate
       neighbor extbgp activate
       redistribute connected
       network 10.237.0.253/32 route-map primary
      exit-address-family
      !
      address-family ipv6 unicast
       neighbor intbgp activate
       neighbor extbgp activate
       redistribute connected
      exit-address-family
    !
    route-map primary permit 10
      set community 64502:1
    route-map secondary permit 10
      set community 64502:2
    !
    line vty
    !
    EOF

**extbgp2:**

    cat << EOF | patch -o conf.d/extbgp2_frr.conf -p0
    --- conf.d/extbgp1_frr.conf 2023-10-05 11:48:27.734812969 +0200
    +++ conf.d/extbgp2_frr.conf 2023-10-05 11:48:27.734812969 +0200
    @@ -1,15 +1,15 @@
     !
     frr defaults datacenter
    -hostname extbgp1
    +hostname extbgp2
     log syslog informational
     service integrated-vtysh-config
     ipv6 forwarding
     !
     interface lo
    -  ip address 10.0.0.4/32
    +  ip address 10.0.0.5/32
       ip address 10.237.0.253/32
     !
    -router-id 10.0.0.4
    +router-id 10.0.0.5
     !
     router bgp 64503
       bgp bestpath as-path multipath-relax
    @@ -30,12 +30,12 @@
       neighbor intbgp update-source eth1
       !
       address-family ipv4 unicast
    -   network 10.0.0.4/32
    +   network 10.0.0.5/32
        network 10.237.0.0/24
        neighbor intbgp activate
        neighbor extbgp activate
        redistribute connected
    -   network 10.237.0.253/32 route-map primary
    +   network 10.237.0.253/32 route-map secondary
       exit-address-family
       !
       address-family ipv6 unicast
    EOF

## Keepalived for intbgp

A instance of keepalived is installed to keep the shared IP between the two routers. Inspiration on how to set up keepalived and conntrackd comes from https://satishdotpatel.github.io/ha-with-keepalived-and-conntrackd/.

**intbgp1:**

    cat << EOF > conf.d/intbgp1_keepalived.conf
    vrrp_sync_group G1 {
        group {
            EXT
            INT
        }
        notify_master "/etc/conntrackd/primary-backup.sh primary"
        notify_backup "/etc/conntrackd/primary-backup.sh backup"
        notify_fault "/etc/conntrackd/primary-backup.sh fault"
    }

    vrrp_instance INT {
        state MASTER
        interface eth3
        virtual_router_id 11
        priority 50
        advert_int 1
        unicast_src_ip 10.224.0.1
        unicast_peer {
            10.224.0.2
        }
        authentication {
            auth_type PASS
            auth_pass 1111
        }
        virtual_ipaddress {
            10.227.0.254/24 dev eth4
        }
        nopreempt
        garp_master_delay 1
    }
    EOF

**intbgp2:**

    cat << EOF | patch -o conf.d/intbgp2_keepalived.conf -p0
    --- conf.d/intbgp1_keepalived.conf 2023-10-05 11:48:27.734812969 +0200
    +++ conf.d/intbgp2_keepalived.conf 2023-10-05 11:48:27.734812969 +0200
    @@ -9,14 +9,14 @@
     }

     vrrp_instance INT {
    -    state MASTER
    +    state BACKUP
         interface eth3
         virtual_router_id 11
    -    priority 50
    +    priority 25
         advert_int 1
    -    unicast_src_ip 10.224.0.1
    +    unicast_src_ip 10.224.0.2
         unicast_peer {
    -        10.224.0.2
    +        10.224.0.1
         }
         authentication {
             auth_type PASS
    EOF

The primary-backup.sh (non modified example script from conntrackd examples directory) script that are referred in the keepalived.conf :

    cat << EOF > conf.d/primary-backup.shcat conf.d/primary-backup.sh
    #!/bin/sh
    #
    # (C) 2006-2011 by Pablo Neira Ayuso <pablo@netfilter.org>
    #
    # This program is free software; you can redistribute it and/or modify
    # it under the terms of the GNU General Public License as published by
    # the Free Software Foundation; either version 2 of the License, or
    # (at your option) any later version.
    #
    # Description:
    #
    # This is the script for primary-backup setups for keepalived
    # (http://www.keepalived.org). You may adapt it to make it work with other
    # high-availability managers.
    #
    # Do not forget to include the required modifications to your keepalived.conf
    # file to invoke this script during keepalived's state transitions.
    #
    # Contributions to improve this script are welcome :).
    #

    CONNTRACKD_BIN=/usr/sbin/conntrackd
    CONNTRACKD_LOCK=/var/lock/conntrack.lock
    CONNTRACKD_CONFIG=/etc/conntrackd/conntrackd.conf

    case "$1" in
      primary)
        #
        # commit the external cache into the kernel table
        #
        $CONNTRACKD_BIN -C $CONNTRACKD_CONFIG -c
        if [ $? -eq 1 ]
        then
            logger "ERROR: failed to invoke conntrackd -c"
        fi

        #
        # flush the internal and the external caches
        #
        $CONNTRACKD_BIN -C $CONNTRACKD_CONFIG -f
        if [ $? -eq 1 ]
        then
         logger "ERROR: failed to invoke conntrackd -f"
        fi

        #
        # resynchronize my internal cache to the kernel table
        #
        $CONNTRACKD_BIN -C $CONNTRACKD_CONFIG -R
        if [ $? -eq 1 ]
        then
         logger "ERROR: failed to invoke conntrackd -R"
        fi

        #
        # send a bulk update to backups
        #
        $CONNTRACKD_BIN -C $CONNTRACKD_CONFIG -B
        if [ $? -eq 1 ]
        then
            logger "ERROR: failed to invoke conntrackd -B"
        fi
        ;;
      backup)
        #
        # is conntrackd running? request some statistics to check it
        #
        $CONNTRACKD_BIN -C $CONNTRACKD_CONFIG -s
        if [ $? -eq 1 ]
        then
            #
     # something's wrong, do we have a lock file?
     #
         if [ -f $CONNTRACKD_LOCK ]
     then
         logger "WARNING: conntrackd was not cleanly stopped."
         logger "If you suspect that it has crashed:"
         logger "1) Enable coredumps"
         logger "2) Try to reproduce the problem"
         logger "3) Post the coredump to netfilter-devel@vger.kernel.org"
         rm -f $CONNTRACKD_LOCK
     fi
     $CONNTRACKD_BIN -C $CONNTRACKD_CONFIG -d
     if [ $? -eq 1 ]
     then
         logger "ERROR: cannot launch conntrackd"
         exit 1
     fi
        fi
        #
        # shorten kernel conntrack timers to remove the zombie entries.
        #
        $CONNTRACKD_BIN -C $CONNTRACKD_CONFIG -t
        if [ $? -eq 1 ]
        then
         logger "ERROR: failed to invoke conntrackd -t"
        fi

        #
        # request resynchronization with master firewall replica (if any)
        # Note: this does nothing in the alarm approach.
        #
        $CONNTRACKD_BIN -C $CONNTRACKD_CONFIG -n
        if [ $? -eq 1 ]
        then
         logger "ERROR: failed to invoke conntrackd -n"
        fi
        ;;
      fault)
        #
        # shorten kernel conntrack timers to remove the zombie entries.
        #
        $CONNTRACKD_BIN -C $CONNTRACKD_CONFIG -t
        if [ $? -eq 1 ]
        then
         logger "ERROR: failed to invoke conntrackd -t"
        fi
        ;;
      *)
        logger "ERROR: unknown state transition"
        echo "Usage: primary-backup.sh {primary|backup|fault}"
        exit 1
        ;;
    esac

    exit 0
    EOF

## Conntrackd for intbgp

To keep the netfilters in state between both routers, conntrackd with a corresponding configuration was put in place.

**intbgp1:**

    cat << EOF > conf.d/intbgp1_conntrackd.conf
    Sync {
        Mode FTFW {
            DisableExternalCache Off
            StartupResync on
        }

        UDP {
            IPv4_address 10.223.0.1
            IPv4_Destination_Address 10.223.0.2
            Port 3780
            Interface eth2
            Checksum on
        }
    }

    General {
        Systemd off
        HashSize 8192
        HashLimit 65535
        LogFile on
        Syslog off
        LockFile /var/lock/conntrack.lock
        UNIX {
            Path /var/run/conntrackd.ctl
            Backlog 20
        }
        SocketBufferSize 262142
        SocketBufferSizeMaxGrown 655355
        NetlinkBufferSize 262142
        NetlinkBufferSizeMaxGrowth 655355
        Filter From Userspace {
            Protocol Accept {
                TCP
                #UDP
                #ICMP # This requires a Linux kernel >= 2.6.31
            }
            Address Ignore {
                IPv4_address 127.0.0.1 # loopback
                IPv4_address 10.0.0.0/24
                IPv4_address 172.20.20.0/24
                IPv4_address 172.18.0.0/16
                IPv4_address 10.227.0.0/24
                IPv4_address 10.223.0.0/24
                IPv4_address 10.224.0.0/24
                IPv4_address 10.179.0.0/24
            }
        }
    }
    EOF

**intbgp2:**

    cat << EOF | patch -o conf.d/intbgp2_conntrackd.con -p0
    --- conf.d/intbgp1_conntrackd.conf 2023-10-05 11:48:27.734812969 +0200
    +++ conf.d/intbgp2_conntrackd.conf 2023-10-05 11:48:27.734812969 +0200
    @@ -5,8 +5,8 @@
         }

         UDP {
    -        IPv4_address 10.223.0.1
    -        IPv4_Destination_Address 10.223.0.2
    +        IPv4_address 10.223.0.2
    +        IPv4_Destination_Address 10.223.0.1
             Port 3780
             Interface eth2
             Checksum on
    @@ -38,11 +38,8 @@
                 IPv4_address 127.0.0.1 # loopback
                 IPv4_address 10.0.0.0/24
                 IPv4_address 172.20.20.0/24
    -            IPv4_address 172.18.0.0/16
                 IPv4_address 10.227.0.0/24
                 IPv4_address 10.223.0.0/24
    -            IPv4_address 10.224.0.0/24
    -            IPv4_address 10.179.0.0/24
             }
         }
     }
    EOF

## The three virtual switches

The switch configs are more or less in a pristine state, the relevant parts that are changed from original are ports/interfaces with corresponding descriptions and a few VLANs, just because.

**intsw0:**

    cat << EOF > conf.d/intsw0.cfg
    vlan internal order descending range 3000 4094
    !
    hostname intsw0
    !
    spanning-tree mode none
    !
    no aaa root
    !
    username autoadmin privilege 15 role network-admin secret sha512 $6$C0MXmP2mKEqqv5u2$vv6OA.aXVYSE.N99fAJiCWSoalO1yybi1pCFTshfmj2u5USI4Y.dgjBqolaxjW2do.kpd0eGg4JsLGmZSN78F0
    !
    vrf instance mgmtVrf
    !
    ip routing
    ip routing vrf mgmtVrf
    !
    ipv6 unicast-routing
    ipv6 unicast-routing vrf mgmtVrf
    !
    vlan 10
      name servers
    !
    vlan 20
      name clients
    !
    vlan 30
      name bgp-keepalived
    !
    interface Loopback0
      description C: cEOS1-Loopback0
      ip address 1.1.1.1/32
      ipv6 address 2001:db8::1:1:1:1/128
    !
    interface ethernet1
      description L: cEOS2-Eth1
      no switchport
      load-interval 30
      ip address 10.10.10.0/31
      ipv6 address 2001:db8:100::0/127
      ip ospf area 0
      ipv6 ospf 1 area 0
    !
    interface ethernet2
      description L: intbgp1-eth2
      load-interval 30
      switchport
      switchport mode access
      switchport access vlan 20
    !
    interface ethernet3
      description L: intbgp1-eth3
      load-interval 30
      switchport
      switchport mode access
      switchport access vlan 10
    !
    interface ethernet4
      description L: intbgp1-eth4
      load-interval 30
      switchport
      switchport mode access
      switchport access vlan 10
    !
    interface ethernet5
      description L: intbgp2-eth2
      load-interval 30
      switchport
      switchport mode access
      switchport access vlan 20
    !
    interface ethernet6
      description L: intbgp2-eth3
      load-interval 30
      switchport
      switchport mode access
      switchport access vlan 10
    !
    interface ethernet7
      description L: intbgp2-eth4
      load-interval 30
      switchport
      switchport mode access
      switchport access vlan 10
    !
    interface ethernet8
      description L: inthost0-cplane
      load-interval 30
      switchport
      switchport mode access
      switchport access vlan 10
    !
    interface ethernet9
      description L: inthost1-worker
      load-interval 30
      switchport
      switchport mode access
      switchport access vlan 10
    !
    interface ethernet10
      description L: inthost2-worker2
      load-interval 30
      switchport
      switchport mode access
      switchport access vlan 10
    !
    interface ethernet11
      description L: inthost3-worker3
      load-interval 30
      switchport
      switchport mode access
      switchport access vlan 10
    !
    interface ethernet12
      description L: inthost4
      load-interval 30
      switchport
      switchport mode access
      switchport access vlan 10
    !
    interface Management0
      description L: Mgmt Interface
      vrf mgmtVrf
      ip address 10.10.10.2/24
      ipv6 address 2001:10:10:10::2/64
    !
    interface vlan 10
      description H: Servers vlan
      load-interval 30
      ip address 10.227.0.1/24
    !
    interface vlan 20
      description H: Servers vlan
      load-interval 30
      ip address 10.223.0.1/24
    !
    router ospf 1
      router-id 1.1.1.3
      redistribute connected
      redistribute static
      log-adjacency-changes details
      bfd default
    !
    ipv6 router ospf 1
      router-id 1.1.1.3
      redistribute static
      redistribute connected
      log-adjacency-changes details
      bfd default
    !
    router bfd
       interval 500 min-rx 500 multiplier 3 default
    !
    management api http-commands
       no shutdown
    !
    management api gnmi
       transport grpc default
    !
    management api netconf
       transport ssh default
    !
    EOF

**peersw0:**

    cat << EOF > conf.d/peersw0.cfg
    vlan internal order descending range 3000 4094
    !
    hostname peersw0
    !
    spanning-tree mode none
    !
    no aaa root
    !
    username autoadmin privilege 15 role network-admin secret sha512 $6$C0MXmP2mKEqqv5u2$vv6OA.aXVYSE.N99fAJiCWSoalO1yybi1pCFTshfmj2u5USI4Y.dgjBqolaxjW2do.kpd0eGg4JsLGmZSN78F0
    !
    vrf instance mgmtVrf
    !
    ip routing
    ip routing vrf mgmtVrf
    !
    ipv6 unicast-routing
    ipv6 unicast-routing vrf mgmtVrf
    !
    vlan 40
      name bgp-peers
    !
    interface Loopback0
      description C: cEOS2-Loopback0
      ip address 1.1.1.1/32
      ipv6 address 2001:db8::1:1:1:1/128
    !
    interface ethernet1
      description L: cEOS2-Eth1
      no switchport
      load-interval 30
      ip address 10.10.10.0/31
      ipv6 address 2001:db8:100::0/127
      ip ospf area 0
      ipv6 ospf 1 area 0
    !
    interface ethernet2
      description L: intbgp1
      load-interval 30
      switchport
      switchport mode access
      switchport access vlan 40
    !
    interface ethernet3
      description L: intbgp1
      load-interval 30
      switchport
      switchport mode access
      switchport access vlan 40
    !
    interface ethernet4
      description L: extbgp1
      load-interval 30
      switchport
      switchport mode access
      switchport access vlan 40
    !
    interface ethernet5
      description L: extbgp2
      load-interval 30
      switchport
      switchport mode access
      switchport access vlan 40
    !
    interface Management0
      description L: Mgmt Interface
      vrf mgmtVrf
      ip address 10.10.10.3/24
    !
    interface vlan 40
      description H: BGP peering vlan
      load-interval 30
      ip address 10.0.0.1/24
    !
    router ospf 1
      router-id 1.1.1.2
      redistribute connected
      redistribute static
      log-adjacency-changes details
      bfd default
    !
    ipv6 router ospf 1
      router-id 1.1.1.2
      redistribute static
      redistribute connected
      log-adjacency-changes details
      bfd default
    !
    router bfd
       interval 500 min-rx 500 multiplier 3 default
    !
    management api http-commands
       no shutdown
    !
    management api gnmi
       transport grpc default
    !
    management api netconf
       transport ssh default
    !
    EOF

**extsw0:**

    cat << EOF > conf.d/extsw0.cfg
    vlan internal order descending range 3000 4094
    !
    hostname extsw0
    !
    spanning-tree mode none
    !
    no aaa root
    !
    username autoadmin privilege 15 role network-admin secret sha512 $6$C0MXmP2mKEqqv5u2$vv6OA.aXVYSE.N99fAJiCWSoalO1yybi1pCFTshfmj2u5USI4Y.dgjBqolaxjW2do.kpd0eGg4JsLGmZSN78F0
    !
    vrf instance mgmtVrf
    !
    ip routing
    ip routing vrf mgmtVrf
    !
    ipv6 unicast-routing
    ipv6 unicast-routing vrf mgmtVrf
    !
    vlan 10
      name servers
    !
    vlan 20
      name clients
    !
    interface Loopback0
      description C: cEOS2-Loopback0
      ip address 1.1.1.1/32
    !
    interface ethernet1
      description L: cEOS3-Eth1
      no switchport
      load-interval 30
      ip address 10.10.10.0/31
      ipv6 address 2001:db8:100::0/127
      ip ospf area 0
      ipv6 ospf 1 area 0
    !
    interface ethernet2
      description L: extbgp1-eth2
      load-interval 30
      switchport
      switchport mode access
      switchport access vlan 10
    !
    interface ethernet3
      description L: extbgp1-eth3
      load-interval 30
      switchport
      switchport mode access
      switchport access vlan 10
    !
    interface ethernet4
      description L: extbgp2-eth2
      load-interval 30
      switchport
      switchport mode access
      switchport access vlan 10
    !
    interface ethernet5
      description L: extbgp2-eth3
      load-interval 30
      switchport
      switchport mode access
      switchport access vlan 10
    !
    interface ethernet6
      description L: exthost0-cplane
      load-interval 30
      switchport
      switchport mode access
      switchport access vlan 10
    !
    interface ethernet7
      description L: exthost1-worker
      load-interval 30
      switchport
      switchport mode access
      switchport access vlan 10
    !
    interface ethernet8
      description L: exthost2-worker2
      load-interval 30
      switchport
      switchport mode access
      switchport access vlan 10
    !
    interface ethernet9
      description L: exthost3-worker3
      load-interval 30
      switchport
      switchport mode access
      switchport access vlan 10
    !
    interface ethernet10
      description L: exthost4
      load-interval 30
      switchport
      switchport mode access
      switchport access vlan 10
    !
    interface ethernet11
      description L: extgw0
      load-interval 30
      switchport
      switchport mode access
      switchport access vlan 10
    !
    interface Management0
      description L: Mgmt Interface
      vrf mgmtVrf
      ip address 10.10.10.4/24
    !
    interface vlan 10
      description H: Servers vlan
      load-interval 30
      ip address 10.237.0.1/24
    !
    interface vlan 20
      description H: Servers vlan
      load-interval 30
      ip address 10.233.0.1/24
    !
    router ospf 1
      router-id 1.1.1.1
      redistribute connected
      redistribute static
      log-adjacency-changes details
      bfd default
    !
    ipv6 router ospf 1
      router-id 1.1.1.1
      redistribute static
      redistribute connected
      log-adjacency-changes details
      bfd default
    !
    router bfd
       interval 500 min-rx 500 multiplier 3 default
    !
    management api http-commands
       no shutdown
    !
    management api gnmi
       transport grpc default
    !
    management api netconf
       transport ssh default
    !
    EOF

## Kind

As I intend to run Kubernetes on Kind through the Containerlab I've prepared two clusters. The CNI of choice is Cilium (without kube-proxy), but this is work in progress..

**cluster one, aka "clab":**

    cat << EOF > clab_cluster.yaml
    kind: Cluster
    name: clab-k8s
    apiVersion: kind.x-k8s.io/v1alpha4
    networking:
      disableDefaultCNI: true
      podSubnet: "10.0.0.0/16"
      serviceSubnet: "10.1.0.0/16"
      kubeProxyMode: "none"
    nodes:
    - role: control-plane
      kubeadmConfigPatches:
      - |
        kind: InitConfiguration
        nodeRegistration:
          kubeletExtraArgs:
            node-ip: 10.227.0.2

    - role: worker
      kubeadmConfigPatches:
      - |
        kind: JoinConfiguration
        nodeRegistration:
          kubeletExtraArgs:
            node-ip: 10.227.0.3
            node-labels: "pool=worker"

    - role: worker
      kubeadmConfigPatches:
      - |
        kind: JoinConfiguration
        nodeRegistration:
          kubeletExtraArgs:
            node-ip: 10.227.0.4
            node-labels: "pool=worker"

    - role: worker
      kubeadmConfigPatches:
      - |
        kind: JoinConfiguration
        nodeRegistration:
          kubeletExtraArgs:
            node-ip: 10.227.0.5
            node-labels: "pool=worker"
    EOF

**cluster two, aka "clab2":**

    cat << EOF > clab2_cluster.yaml
    kind: Cluster
    name: clab2-k8s
    apiVersion: kind.x-k8s.io/v1alpha4
    networking:
      disableDefaultCNI: true
      podSubnet: "10.2.0.0/16"
      serviceSubnet: "10.3.0.0/16"
      kubeProxyMode: "none"
    nodes:
    - role: control-plane
      kubeadmConfigPatches:
      - |
        kind: InitConfiguration
        nodeRegistration:
          kubeletExtraArgs:
            node-ip: 10.237.0.2

    - role: worker
      kubeadmConfigPatches:
      - |
        kind: JoinConfiguration
        nodeRegistration:
          kubeletExtraArgs:
            node-ip: 10.237.0.3
            node-labels: "pool=worker"

    - role: worker
      kubeadmConfigPatches:
      - |
        kind: JoinConfiguration
        nodeRegistration:
          kubeletExtraArgs:
            node-ip: 10.237.0.4
            node-labels: "pool=worker"

    - role: worker
      kubeadmConfigPatches:
      - |
        kind: JoinConfiguration
        nodeRegistration:
          kubeletExtraArgs:
            node-ip: 10.237.0.5
            node-labels: "pool=worker"
    EOF

Spin up the clusters:

    for i in clab clab2
    do
    kind create cluster --config ${i}_cluster.yaml
    done

## Containerlab

Then, at last, what this article was really about - setup of Containerlab.

The layout was made to prepare for future installation of Kind Kubernetes clusters (the {int,ext}host{0–3} nodes). Inspiration on how to setup frr configuration comes from https://www.sobyte.net/post/2022-09/containerlab-kind-cilium-bgp/, before looking at that I had more configuration files to keep track of.

### Prerequisites

Installation instructions are outlined at https://containerlab.dev/install/ but basically it is to find a Linux environment with a decent amount of memory (I have a vm with 12G), install a recent docker.io and containerlab itself.

For the Arista cEOS (the switches) I followed these [instructions](https://containerlab.dev/manual/kinds/ceos/#getting-ceos-image) in order to fetch the image, but there are probably easier way to do the switching as I really only wanted interfaces and simple connectivity - a simple netshoot image would probably do equal result.

    cat << EOF > clab-k8s-conntrack-bgp.yml
    name: k8s
    topology:
      kinds:
        linux:
          cmd: bash
      nodes:
        intsw0:
          kind: ceos
          image: ceos:4.30.2F
          startup-config: ./conf.d/intsw0.cfg
        peersw0:
          kind: ceos
          image: ceos:4.30.2F
          startup-config: ./conf.d/peersw0.cfg
        extsw0:
          kind: ceos
          image: ceos:4.30.2F
          startup-config: ./conf.d/extsw0.cfg
        inthost0:
          kind: linux
          image: nicolaka/netshoot:latest
          network-mode: container:clab-k8s-control-plane
          exec:
          - ip addr add 10.227.0.2/24 dev net0
          - ip route add 10.237.0.0/24 via 10.227.0.254
        inthost1:
          kind: linux
          image: nicolaka/netshoot:latest
          network-mode: container:clab-k8s-worker
          exec:
          - ip addr add 10.227.0.3/24 dev net0
          - ip route add 10.237.0.0/24 via 10.227.0.254
        inthost2:
          kind: linux
          image: nicolaka/netshoot:latest
          network-mode: container:clab-k8s-worker2
          exec:
          - ip addr add 10.227.0.4/24 dev net0
          - ip route add 10.237.0.0/24 via 10.227.0.254
        inthost3:
          kind: linux
          image: nicolaka/netshoot:latest
          network-mode: container:clab-k8s-worker3
          exec:
          - ip addr add 10.227.0.5/24 dev net0
          - ip route add 10.237.0.0/24 via 10.227.0.254
        inthost4:
          kind: linux
          image: nicolaka/netshoot:latest
          exec:
          - ip addr add 10.227.0.6/24 dev net0
          - ip route add 10.237.0.0/24 via 10.227.0.254
        exthost0:
          kind: linux
          image: nicolaka/netshoot:latest
          network-mode: container:clab2-k8s-control-plane
          exec:
          - ip addr add 10.237.0.2/24 dev net0
        exthost1:
          kind: linux
          image: nicolaka/netshoot:latest
          network-mode: container:clab2-k8s-worker
          exec:
          - ip addr add 10.237.0.3/24 dev net0
        exthost2:
          kind: linux
          image: nicolaka/netshoot:latest
          network-mode: container:clab2-k8s-worker2
          exec:
          - ip addr add 10.237.0.4/24 dev net0
        exthost3:
          kind: linux
          image: nicolaka/netshoot:latest
          network-mode: container:clab2-k8s-worker3
          exec:
          - ip addr add 10.237.0.5/24 dev net0
        exthost4:
          kind: linux
          image: quay.io/solo-io/echo-server
          exec:
          - ip addr add 10.237.0.8/24 dev net0
          - ip route replace default via 10.237.0.253
        extgw0:
          kind: linux
          image: frrouting/frr:v8.2.2
          exec:
            - ip addr add 10.237.0.254/24 dev eth1
            - iptables-restore /etc/iptables.conf
          binds:
            - ./conf.d/extgw0_iptables.conf:/etc/iptables.conf
        intbgp1:
          kind: linux
          image: quay.io/frrouting/frr:8.5.3
          exec:
            - ip addr add 10.223.0.1/24 dev eth2
            - ip addr add 10.224.0.1/24 dev eth3
            - apk add openrc conntrack-tools conntrack-tools-openrc keepalived
            - sysctl -w net.ipv4.ip_nonlocal_bind=1
            - sysctl -w net.ipv4.ip_forward=1
            - sed -i -e 's/bgpd=no/bgpd=yes/g' /etc/frr/daemons
            - touch /etc/frr/vtysh.conf
            - /usr/sbin/conntrackd  -d -C  /etc/conntrackd/conntrackd.conf
            - /usr/sbin/keepalived -f /etc/keepalived/keepalived.conf
            - iptables -t nat -A POSTROUTING -s 10.227.0.0/24 -o eth1 -j SNAT --to-source 10.227.0.254
            - iptables -A FORWARD -m state --state RELATED -j ACCEPT
            - iptables -A FORWARD -i eth4 -m state --state ESTABLISHED -j ACCEPT
            - iptables -A FORWARD -i eth1 -m state --state ESTABLISHED -j ACCEPT
            - /usr/lib/frr/frrinit.sh start
          binds:
            - ./conf.d/intbgp1_conntrackd.conf:/etc/conntrackd/conntrackd.conf
            - ./conf.d/intbgp1_frr.conf:/etc/frr/frr.conf
            - ./conf.d/intbgp1_keepalived.conf:/etc/keepalived/keepalived.conf
            - ./conf.d/primary-backup.sh:/etc/conntrackd/primary-backup.sh
            - ./conf.d/intbgp_iptables.conf:/etc/iptables.conf
        intbgp2:
          kind: linux
          image: quay.io/frrouting/frr:8.5.3
          exec:
            - ip addr add 10.223.0.2/24 dev eth2
            - ip addr add 10.224.0.2/24 dev eth3
            - apk add openrc conntrack-tools conntrack-tools-openrc keepalived
            - sysctl -w net.ipv4.ip_nonlocal_bind=1
            - sysctl -w net.ipv4.ip_forward=1
            - sed -i -e 's/bgpd=no/bgpd=yes/g' /etc/frr/daemons
            - touch /etc/frr/vtysh.conf
            - /usr/sbin/conntrackd  -d -C  /etc/conntrackd/conntrackd.conf
            - /usr/sbin/keepalived -f /etc/keepalived/keepalived.conf
            - iptables -t nat -A POSTROUTING -s 10.227.0.0/24 -o eth1 -j SNAT --to-source 10.227.0.254
            - iptables -A FORWARD -m state --state RELATED -j ACCEPT
            - iptables -A FORWARD -i eth4 -m state --state ESTABLISHED -j ACCEPT
            - iptables -A FORWARD -i eth1 -m state --state ESTABLISHED -j ACCEPT
            - /usr/lib/frr/frrinit.sh start
          binds:
            - ./conf.d/intbgp2_conntrackd.conf:/etc/conntrackd/conntrackd.conf
            - ./conf.d/intbgp2_frr.conf:/etc/frr/frr.conf
            - ./conf.d/intbgp2_keepalived.conf:/etc/keepalived/keepalived.conf
            - ./conf.d/primary-backup.sh:/etc/conntrackd/primary-backup.sh
            - ./conf.d/intbgp_iptables.conf:/etc/iptables.conf
        extbgp1:
          kind: linux
          image: quay.io/frrouting/frr:8.5.3
          exec:
            - ip addr add 10.237.0.251/24 dev eth2
            - ip addr add 10.234.0.1/24 dev eth3
            - sysctl -w net.ipv4.ip_nonlocal_bind=1
            - sysctl -w net.ipv4.ip_forward=1
            - touch /etc/frr/vtysh.conf
            - sed -i -e 's/bgpd=no/bgpd=yes/g' /etc/frr/daemons
            - /usr/lib/frr/frrinit.sh start
          binds:
            - ./conf.d/extbgp1_frr.conf:/etc/frr/frr.conf
        extbgp2:
          kind: linux
          image: quay.io/frrouting/frr:8.5.3
          exec:
            - ip addr add 10.237.0.252/24 dev eth2
            - ip addr add 10.234.0.2/24 dev eth3
            - sysctl -w net.ipv4.ip_nonlocal_bind=1
            - sysctl -w net.ipv4.ip_forward=1
            - touch /etc/frr/vtysh.conf
            - sed -i -e 's/bgpd=no/bgpd=yes/g' /etc/frr/daemons
            - /usr/lib/frr/frrinit.sh start
          binds:
            - ./conf.d/extbgp2_frr.conf:/etc/frr/frr.conf
      links:
        - endpoints: ["intsw0:eth2","intbgp1:eth2"]
        - endpoints: ["intsw0:eth3","intbgp1:eth3"]
        - endpoints: ["intsw0:eth4","intbgp1:eth4"]
        - endpoints: ["intsw0:eth5","intbgp2:eth2"]
        - endpoints: ["intsw0:eth6","intbgp2:eth3"]
        - endpoints: ["intsw0:eth7","intbgp2:eth4"]
        - endpoints: ["intsw0:eth8","inthost0:net0"]
        - endpoints: ["intsw0:eth9","inthost1:net0"]
        - endpoints: ["intsw0:eth10","inthost2:net0"]
        - endpoints: ["intsw0:eth11","inthost3:net0"]
        - endpoints: ["intsw0:eth12","inthost4:net0"]
        - endpoints: ["peersw0:eth2","intbgp1:eth1"]
        - endpoints: ["peersw0:eth3","intbgp2:eth1"]
        - endpoints: ["peersw0:eth4","extbgp1:eth1"]
        - endpoints: ["peersw0:eth5","extbgp2:eth1"]
        - endpoints: ["extsw0:eth2","extbgp1:eth2"]
        - endpoints: ["extsw0:eth3","extbgp1:eth3"]
        - endpoints: ["extsw0:eth4","extbgp2:eth2"]
        - endpoints: ["extsw0:eth5","extbgp2:eth3"]
        - endpoints: ["extsw0:eth6","exthost0:net0"]
        - endpoints: ["extsw0:eth7","exthost1:net0"]
        - endpoints: ["extsw0:eth8","exthost2:net0"]
        - endpoints: ["extsw0:eth9","exthost3:net0"]
        - endpoints: ["extsw0:eth10","exthost4:net0"]
        - endpoints: ["extsw0:eth11","extgw0:eth1"]
    EOF

As above configuration refers to Kind nodes, either the Kubernetes clusters needs to be setup (or just uncomment the parts referring to them) before starting the deployment:

    sudo -E containerlab deploy -t clab-k8s-conntrack-bgp.yml

The deployment takes a minute or two. Then, when everything is deployed, and everything went as planned, the outgoing traffic should be masked with the shared IP:

    $ docker exec -it clab-k8s-inthost3 \
    > curl --connect-timeout 4 10.237.0.8:8080 | jq '{RemoteAddr}'
    {
      "RemoteAddr": "10.227.0.254:37910"
    }

Traceroute looks like this (from a node in intbgp to a node in extbgp):

    docker exec -it clab-k8s-inthost4 traceroute 10.237.0.8
    traceroute to 10.237.0.8 (10.237.0.8), 30 hops max, 46 byte packets
     1  10.227.0.254 (10.227.0.254)  1.775 ms  2.042 ms  1.462 ms
     2  10.0.0.4 (10.0.0.4)  2.973 ms  2.161 ms  1.197 ms
     3  10.237.0.8 (10.237.0.8)  2.314 ms  4.043 ms  3.303 ms

Then, as that went smooth I began trying out how to let two Kubernetes clusters spin up with Kind (I have to admit that this is my first attempt with Kind as my bhyve environment(s) have serve me rather well), install Cilium, let Cilium peer with the (goBGP) BGP Control-Plane, implement ClusterMesh.. well, let Containerlab go for a real spin. But that seem to be a good reason to write another article.

I've published the files at my GitHub repo as well:

https://github.com/tnorlin/containerlab-snat-demo

Refs:
https://www.sobyte.net/post/2022-09/containerlab-kind-cilium-bgp/
https://www.linode.com/docs/products/compute/compute-instances/guides/failover-bgp-frr/
https://www.brianlinkletter.com/2021/05/use-containerlab-to-emulate-open-source-routers/
https://satishdotpatel.github.io/ha-with-keepalived-and-conntrackd/
