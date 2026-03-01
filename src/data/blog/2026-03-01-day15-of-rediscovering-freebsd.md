---
title: Day #15 of rediscovering FreeBSD
description: "I've decided to rediscover FreeBSD as FreeBSD 15.0 was recently released."
pubDatetime: 2026-03-01T18:11:46.030Z
category: tech
draft: false
featured: true
tags: [FreeBSD, illumos, homelab]
---
![Photo by Samuel  Sianipar - https://unsplash.com/@samthewam24](/assets/plumbing.jpg)Plumbing - Photo by Samuel Sianipar - https://unsplash.com/@samthewam24.

---

I've been running FreeBSD periodically for some time, but it was a long time since I made a serious attempt of having it in the front seat (besides having OPNSense instances as my firewalls at home).

During my first real attempt of using it as a daily driver, I ditched Debian (sarge) and went for FreeBSD 5.0, just to find out that I weren't too fond of the performance (my choice of motherboard and it's components to blame) and method of disk encryption through gbde. I Eventually went back to Debian and Jari Ruusu's then, exceptional ( actually I believe it still is, compared to LUKS that just happens to be more convenient) Loop AES for handling my data…

Fast forward to 2026 and I'm trying to rediscover FreeBSD 15, in one machine that I happily have been running [OmniOS](https://omnios.org/) since 2021 (when I bought the hardware, I intended to use if as a Linux hypervisor as I already had two machines running [illumos](https://illumos.org/).. that lasted for two weeks until I installed OmniOS into it without looking back).
I'm still happy with OmniOS and have the rpool in a separate flash drive, so I can boot into it whenever I want, but now I'll try to instead replace the functions with [FreeBSD](https://www.freebsd.org/).

---

# Networking and virtualisation

What about the other 14 days, you might think? Well, some ten days (as you may figure, calendar time, and not actual time troubleshooting) went into reading up a bit on networking and virtualisation strategies, until I came up with something I think may work for me and in some sense translates from illumos.

I tried to follow the new bridge design that arrived with FreeBSD, couldn't grasp why the connection disconnected from the host whenever I started a jail. Now, in retrospective, this whole thing makes me chuckle when I think about it - I had some spanning tree loops killing the ports!

First I thought I misunderstood the syntax and reconfigured, then I blamed my LAG interface at the switch, and moved to a non LAG switch port, and still thought I misunderstood the syntax as the issues didn't go away. Then I found it, in the events of the switch - spanning tree loops. When I, during the autumn, replaced a ruckus switch with a Unifi I got my first hand experiences with the issue (IIRC that was due to I had not configured LAG on the Unifi) and configured RTSP on affected VLANs to not bring down the whole network in event of it happening again. Now, that I had those interfaces going down (BLOCKED) I realised - I had 5 interfaces directly connected to the switch that I not yet configured as pass through devices!

## Pass through devices

In illumos, pass through devices is (mostly) found with running the ```prtconf``` command and looking for output like:
```
i86pc (driver name: rootnex)
    scsi_vhci, instance #0 (driver name: scsi_vhci)
    pci, instance #0 (driver name: npe)
        pci15d9,86d (pciex8086,6f00) [Intel Corporation Xeon E7 v4/Xeon E5 v4/Xeon E3 v4/Xeon D DMI2]
        pci8086,6f02 (pciex8086,6f02) [Intel Corporation Xeon E7 v4/Xeon E5 v4/Xeon E3 v4/Xeon D PCI Express Root Port 1], instance #0 (driver name: pcieb)
            pci8086,9008 (pciex8086,b60) [Intel Corporation NVMe DC SSD [3DNAND, Sentinel Rock Controller]], instance #1 (driver name: nvme)
                blkdev, instance #1 (driver name: blkdev)
        pci8086,6f04 (pciex8086,6f04) [Intel Corporation Xeon E7 v4/Xeon E5 v4/Xeon E3 v4/Xeon D PCI Express Root Port 2], instance #1 (driver name: pcieb)
            pci15d9,86d (pciex8086,6f50) [Intel Corporation Xeon Processor D Family QuickData Technology Register DMA Channel 0]
            pci15d9,86d (pciex8086,6f51) [Intel Corporation Xeon Processor D Family QuickData Technology Register DMA Channel 1]
            pci15d9,86d (pciex8086,6f52) [Intel Corporation Xeon Processor D Family QuickData Technology Register DMA Channel 2]
            pci15d9,86d (pciex8086,6f53) [Intel Corporation Xeon Processor D Family QuickData Technology Register DMA Channel 3]
        pci8086,6f06 (pciex8086,6f06) [Intel Corporation Xeon E7 v4/Xeon E5 v4/Xeon E3 v4/Xeon D PCI Express Root Port 2], instance #2 (driver name: pcieb)
            pci15d9,15ad (pciex8086,15ad) [Intel Corporation Ethernet Connection X552/X557-AT 10GBASE-T], instance #0 (driver name: ixgbe)
            pci15d9,15ad (pciex8086,15ad) [Intel Corporation Ethernet Connection X552/X557-AT 10GBASE-T], instance #1 (driver name: ixgbe)
        pci8086,6f08 (pciex8086,6f08) [Intel Corporation Xeon E7 v4/Xeon E5 v4/Xeon E3 v4/Xeon D PCI Express Root Port 3], instance #3 (driver name: pcieb)
            pci15d9,611 (pciex8086,10fb) [Intel Corporation 82599ES 10-Gigabit SFI/SFP+ Network Connection], instance #0 (driver name: ppt)
            pci15d9,611 (pciex8086,10fb) [Intel Corporation 82599ES 10-Gigabit SFI/SFP+ Network Connection], instance #1 (driver name: ppt)
```

Physical devices that the kernel should consider for PPT in /etc/matches:
```
    pciex8086,10fb
    pciex8086,1521
```

and the actual devices in /etc/alias (here it can also be something like ```/pci@0,0/pci15d9,921@14/device@1``` to select the first port of a device):
```
    ppt "pciex8086,10fb"
    ppt "pciex8086,1521"
```
With FreeBSD, it felt a bit easier with ```pciconf -vl``` and then select the devices based on the numbers in the selector column:
```
ppt4@pci0:183:0:0: class=0x020000 rev=0x04 hdr=0x00 vendor=0x8086 device=0x37d2 subvendor=0x15d9 subdevice=0x37d2
    vendor     = 'Intel Corporation'
    device     = 'Ethernet Connection X722 for 10GBASE-T'
    class      = network
    subclass   = ethernet
ppt5@pci0:183:0:1: class=0x020000 rev=0x04 hdr=0x00 vendor=0x8086 device=0x37d2 subvendor=0x15d9 subdevice=0x37d2
    vendor     = 'Intel Corporation'
    device     = 'Ethernet Connection X722 for 10GBASE-T'
    class      = network
    subclass   = ethernet
ixl0@pci0:183:0:2: class=0x020000 rev=0x04 hdr=0x00 vendor=0x8086 device=0x37d0 subvendor=0x15d9 subdevice=0x37d0
    vendor     = 'Intel Corporation'
    device     = 'Ethernet Connection X722 for 10GbE SFP+'
    class      = network
    subclass   = ethernet
```

add it in the ```/boot/loader.conf``` as pptdevs:
```
    pptdevs="102/0/0 102/0/1 102/0/2 102/0/3 183/0/0 183/0/1"
```

With the devices excluded, loops seemingly out of the way and I could proceed with the setup of networking (again).

## Link aggregation

At home, link aggregation can be uneccessary complication, but it can also benefit against saturation (especially with 1G links) and during restructure (disconnect one wire at a time and still have connectivity). I just so happen to have it enabled in the OmniOS installation and I want things to be as smooth as possible whenever I feel a need to boot into it, so I replicate it in FreeBSD.

I think that I cannot enough show my appreciation for what Sunay Tripathi et. al. created with the [crossbow project](https://www.usenix.org/legacy/event/lisa09/tech/full_papers/tripathi.pdf) for solaris. It's truly amazing that over 15 years later, the implementation still feels like it's at least a couple of years ahead of any (that I'm aware of) other implementation.

Just have a look at the data link administration command [dladm(8)](https://man.omnios.org/man8/dladm):
```
Combine a set of links into a single IEEE 802.3ad link aggregation named aggr-link. The use of an integer key to generate a link name for the aggregation is also supported for backward compatibility. Many of the -aggr subcommands below also support the use of a key to refer to a given aggregation, but use of the aggregation link name is preferred. See the NOTES section for more information on keys.

dladm supports a number of port selection policies for an aggregation of ports. (See the description of the -P option, below). If you do not specify a policy, create-aggr uses the L4 policy, described under the -P option.


-l ether-link, --link=ether-link
Each Ethernet link (or port) in the aggregation is specified using an -l option followed by the name of the link to be included in the aggregation. Multiple links are included in the aggregation by specifying multiple -l options. For backwards compatibility, the dladm command also supports the using the -d option (or --dev) with a device name to specify links by their underlying device name. The other -aggr subcommands that take -l options also accept -d.
-t, --temporary
Specifies that the aggregation is temporary. Temporary aggregations last until the next reboot.
-R root-dir, --root-dir=root-dir
See Options, above.
-P policy, --policy=policy
Specifies the port selection policy to use for load spreading of outbound traffic. The policy specifies which dev object is used to send packets. A policy is a list of one or more layers specifiers separated by commas. A layer specifier is one of the following:
L2
Select outbound device according to source and destination MAC addresses of the packet.
L3
Select outbound device according to source and destination IP addresses of the packet.
L4
Select outbound device according to the upper layer protocol information contained in the packet. For TCP and UDP this includes source and destination ports. For IPsec, this includes the SPI (Security Parameters Index).
For example, to use upper layer protocol information, the following policy can be used:

-P L4
Note that policy L4 is the default.

To use the source and destination MAC addresses as well as the source and destination IP addresses, the following policy can be used:

-P L2,L3
-L mode, --lacp-mode=mode
Specifies whether LACP should be used and, if used, the mode in which it should operate. Supported values are off, active or passive.
-T time, --lacp-timer=mode
Specifies the LACP timer value. The supported values are short or long.
-u address, --unicast=address
Specifies a fixed unicast hardware address to be used for the aggregation. If this option is not specified, then an address is automatically chosen from the set of addresses of the component devices.
```

The same command sets up (persistently), shows and modifies link aggregations (or other data links, such as physical, ethernet, vlan, wifi and IP tunnels). Sample from one of my other machines:
```
    $ dladm show-aggr aggr0 -L
    LINK        PORT         AGGREGATABLE SYNC COLL DIST DEFAULTED EXPIRED
    aggr0       ixgbe0       yes          yes  yes  yes  no        no
    --          ixgbe1       yes          yes  yes  yes  no        no
    
    $ dladm show-aggr aggr0 -P
    LINK            POLICY   ADDRPOLICY           LACPACTIVITY  LACPTIMER   FLAGS
    aggr0           L4       auto                 active        short       -----
    
    $ dladm show-aggr aggr0 -x 
    LINK        PORT           SPEED    DUPLEX   STATE    ADDRESS            PORTSTATE
    aggr0       --             1000Mb   full     up       ac:1f:6b:a5:f8:42  --
                ixgbe0         1000Mb   full     up       ac:1f:6b:a5:f8:42  attached
                ixgbe1         1000Mb   full     up       ac:1f:6b:a5:f8:43  attached
    
    $ dladm show-aggr aggr0 -s 
    LINK        PORT      IPACKETS RBYTES OPACKETS OBYTES IPKTDIST OPKTDIST
    aggr0       --        17983090538 1644928576672 20064895095 1799107450385 -- --
    --          ixgbe0    8468569944 820140880664 11111809306 904897084336 47.1   55.4  
    --          ixgbe1    9514520594 824787696008 8953085789 894210366049 52.9   44.6  
```

Back to FreeBSD and setup. The structure is described in https://docs.freebsd.org/en/books/handbook/advanced-networking/#network-aggregation and I set it in ```/etc/rc.conf``` as:
```
    cloned_interfaces="lagg0"
    ifconfig_ixl0="-vlanhwfilter up"
    ifconfig_ixl1="-vlanhwfilter up"
    ifconfig_lagg0="laggproto lacp laggport ixl0 laggport ixl1 up"
    ifconfig_lagg0_description="LAG201"
````

and it shows up as:
```
    $ ifconfig lagg0
    lagg0: flags=1008943<UP,BROADCAST,RUNNING,PROMISC,SIMPLEX,MULTICAST,LOWER_UP> metric 0 mtu 1500
     options=a400b9<RXCSUM,VLAN_MTU,VLAN_HWTAGGING,JUMBO_MTU,VLAN_HWCSUM,VLAN_HWTSO,RXCSUM_IPV6,HWSTATS>
     ether 00:25:90:a9:39:8a
     hwaddr 00:00:00:00:00:00
     laggproto lacp lagghash l2,l3,l4
     laggport: ixl0 flags=1c<ACTIVE,COLLECTING,DISTRIBUTING>
     laggport: ixl1 flags=1c<ACTIVE,COLLECTING,DISTRIBUTING>
     groups: lagg
     media: Ethernet autoselect
     status: active
     nd6 options=29<PERFORMNUD,IFDISABLED,AUTO_LINKLOCAL>
```

## Bridge layer

In illumos, I don't set up bridge interfaces as I find them as something adding up to the datapath in a way that is of no use for me. Instead I create a ```vnic``` that is a virtual interface, and connect it directly to the aggregation link layer.

```
vnic-link   A virtual network interface created on a link, an
            etherstub, or an overlay.  It is a pseudo device
            that can be treated as if it were an network
            interface card on a machine.
```

Example from another OmniOS machine, I have a zone with a vnic interface exposed as a TFTP PXE service on a dedicated VLAN:
```
    $ dladm show-vnic pxebooter0
    LINK         OVER       SPEED    MACADDRESS        MACADDRTYPE VID  ZONE
    pxebooter0   aggr0      1000     2:8:20:f4:7d:62   fixed       69   pxebooter
    
    $ dladm show-vnic -s pxebooter0
            ipackets  rbytes      opackets  obytes          
    Total   16321811  7879573143  14054330  43176235359 
    pxebooter0      16321811  7879573143  14054330  43176235359     100.0   100.0
```

The link is called ```pxebooter0``` and tagged with VLAN 69, with a fixed MAC address in a zone called ```pxebooter``` in the global zone's (host) LAGG called ```aggr0```. And the next command, with statistics.

Back to FreeBSD, a bridge is configured as (in ```/etc/rc.conf```):
```
    cloned_interfaces="lagg0 bridge0"
    [.. truncated output here ]
    ifconfig_bridge0="vlanfilter addm lagg0 tagged <insert tagged vlans here>"
```

## VLAN (and IP) Layer

In illumos, I configure the global zone persistently with a vnic, as:
```
    $ dladm create-aggr -l <link> -v <vlanid> 
```

Then if desired, additional linkprops can be set as ```-m``` form a desired mac address, ```-p``` and link properties (such as allowed-ip to only allow a specific CIDR, cpus for CPU pinning.. various options spoof protection, promiscous mode).

In crossbow, there's certainly a way to create a dedicated vlan interface, and then connect an etherstub (a virtual switch) - but I found that as over complicated. But I do use isolated etherstubs for zone networking that should remain within the global zone (host).

Then the addressing of an IP the interfaces happens through the [ipadm(8)](https://man.omnios.org/man8/ipadm) command and consists of two steps  - creation of the IP interface and then addressing it.

While the link it initiated and handled in the global zone, the IP interface is created in the local zone. Looking at IP interface from the global zone:
```
    $ ipadm show-if pxebooter0
ipadm: Could not get interface(s): Interface does not exist
```

Within the local zone, on the other hand:
```
    $ ipadm show-if pxebooter0
    IFNAME     CLASS     STATE    CURRENT      PERSISTENT
    pxebooter0 IP        ok       bm--------46 -46
```

Then, looking at the address, you can see (v4 could be anything, but just an illustration that it is IPv4) the IP address, that the address type is static (but it could be a DHCP and handled automatically by the interface):
```
    $ ipadm show-addr -o all pxebooter0/v4
    ADDROBJ           TYPE     STATE        CURRENT PERSISTENT ADDR
    pxebooter0/v4     static   ok           U----   U--        100.64.0.253/24
```

With FreeBSD on the other hand, I've not find what's the best way. During my spanning tree loop mishaps, I tried the [epair(4)](https://man.freebsd.org/cgi/man.cgi?epair) as an attempt to sort my issues out. As the issue remained, I looked at the setup and it would not make sense to have some form of virtual tunnel with both ends connected at the same point (one with the data link and other end with the IP).
Instead, I looked at the [vlan(4)](https://man.freebsd.org/cgi/man.cgi?vlan) to be my setup. At a glance, the device looks similar to the vlan interface in illumos, and as such possibly not the best device to use (but I could not find the corresponding device to use as a vnic).

Added to the config, it becomes:
```
    cloned_interfaces="bridge0 lagg0 vlan162"
    [.. truncated output here ]
    ifconfig_vlan162="inet 10.12.13.14/26"
```
```
    $ ifconfig vlan162
    vlan163: flags=8843<UP,BROADCAST,RUNNING,SIMPLEX,MULTICAST> metric 0 mtu 1496
     options=0
     ether 58:9c:fc:1a:e1:4f
     inet 10.12.13.14 netmask 0xffffffc0 broadcast 10.12.13.63
     groups: vlan
     vlan: 163 vlanproto: 802.1q vlanpcp: 0 parent interface: bridge0
     nd6 options=29<PERFORMNUD,IFDISABLED,AUTO_LINKLOCAL>
```

Looking at the mtu above, 1496, so there's something lost in the way

Compared to the vnic I showed earlier:
```
    $ dladm show-link pxebooter0
    LINK        CLASS     MTU    STATE    BRIDGE     OVER
    pxebooter0  vnic      1500   up       --         aggr0
```

And looking at the IP interface layer of the vnic, it would also be with a MTU of 1500:
```
    $ ipadm show-ifprop pxebooter0
    IFNAME      PROPERTY        PROTO PERM CURRENT    PERSISTENT DEFAULT    POSSIBLE
    pxebooter0  arp             ipv4  rw   on         --         on         on,off
    pxebooter0  forwarding      ipv4  rw   off        --         off        on,off
    pxebooter0  metric          ipv4  rw   0          --         0          --
    pxebooter0  mtu             ipv4  rw   1500       --         1500       68-1500
    pxebooter0  exchange_routes ipv4  rw   on         --         on         on,off
    pxebooter0  usesrc          ipv4  rw   none       --         none       --
    pxebooter0  forwarding      ipv6  rw   off        --         off        on,off
    pxebooter0  metric          ipv6  rw   0          --         0          --
    pxebooter0  mtu             ipv6  rw   1500       --         1500       1280-1500
    pxebooter0  nud             ipv6  rw   on         --         on         on,off
    pxebooter0  exchange_routes ipv6  rw   on         --         on         on,off
    pxebooter0  usesrc          ipv6  rw   none       --         none       --
    pxebooter0  standby         ip    rw   off        --         off        on,off
```

So there's optimisations I'm not (yet) aware of in FreeBSD, but the relevant part from the ```/etc/rc.conf```: 
```
    $ cat /etc/rc.conf
    hostname="hypar"
    defaultrouter="10.12.13.1"
    cloned_interfaces="bridge0 lagg0 vlan162"
    ifconfig_ixl0="-vlanhwfilter up"
    ifconfig_ixl1="-vlanhwfilter up"
    ifconfig_lagg0="laggproto lacp laggport ixl0 laggport ixl1 up"
    ifconfig_lagg0_description="VM Trunk"
    ifconfig_bridge0="vlanfilter addm lagg0 tagged <vlans>"
    create_args_vlan162="vlan 162 vlandev bridge0"
    ifconfig_vlan162="inet 10.12.13.14/26"
```

## The jail networking

I've looked at [Bastille](https://bastille.readthedocs.io/en/latest/), and while I'm convinced the folks over there are highly skilled, I'm keeping it simple and create vanilla VNET jails (with shell scripts). I saw host optimisations there that I immediately applied in my setup.

In my setup, I follow the vnet guide and create a template (and a snapshot) of 15.0:
```
    $ zfs list -t snapshot -r zroot/jails/templates/15.0-RELEASE
    NAME                                      USED  AVAIL  REFER  MOUNTPOINT
    zroot/jails/templates/15.0-RELEASE@base     8K      -   374M  -
```

Then, for a jail (in vlan 163):
```
    zfs clone zroot/jails/templates/15.0-RELEASE@base zroot/jails/containers/${i}
    
    cat << EOF > /etc/jail.conf.d/${i}.conf
    ${i} {
      # STARTUP/LOGGING 
      exec.start = "/bin/sh /etc/rc"; 
      exec.stop  = "/bin/sh /etc/rc.shutdown";
      exec.consolelog = "/var/log/jail_console_\${name}.log";
    
      # PERMISSIONS
      allow.raw_sockets;
      exec.clean;
      mount.devfs;
      devfs_ruleset = 5;
    
      # PATH/HOSTNAME
      path = "/jails/containers/\${name}";
      host.hostname = "\${name}";
    
      # VNET/VIMAGE
      vnet;
      vnet.interface = "\${epair}b";
    
      # NETWORKS/INTERFACES
      \$id = "${nodes[${i}]##*.}";
      \$ip = "10.163.0.\${id}/24";
      \$gateway = "10.163.0.1";
      \$bridge = "${bridge}";
      \$epair = "epair\${id}";
    
      # ADD TO bridge INTERFACE
      exec.prestart += "ifconfig \${epair} create -vlanhwfilter up";
      exec.prestart += "ifconfig \${bridge} vlanfilter addm \${epair}a untagged 163 up";
      exec.start    += "ifconfig \${epair}b -vlanhwfilter \${ip} up";
      exec.start    += "route add default \${gateway}";
      exec.poststop = "ifconfig ${bridge} deletem \${epair}a";
      exec.poststop += "ifconfig \${epair}a destroy";
    }
    EOF
```

The epair (contrary to the vlan interface I used in the host) uses a normal mtu:
```
    # jexec -u root jail ifconfig epair40b
    epair40b: flags=1008843<UP,BROADCAST,RUNNING,SIMPLEX,MULTICAST,LOWER_UP> metric 0 mtu 1500
     options=200009<RXCSUM,VLAN_MTU,RXCSUM_IPV6>
     ether 58:9c:fc:a0:74:02
     inet 10.163.0.40 netmask 0xffffff00 broadcast 10.163.0.255
     groups: epair
     media: Ethernet 10Gbase-T (10Gbase-T <full-duplex>)
     status: active
     nd6 options=29<PERFORMNUD,IFDISABLED,AUTO_LINKLOCAL>
```

## As for the bhyve guest (and it's networking)…

I believe that I want to remain rather vanilla with the bhyve to begin with, but in a while I want to replicate the neat [zadm(1)](https://github.com/omniosorg/zadm/blob/master/doc/zadm.pod) workflow that I've come to appreciate a lot from [OmniOS](https://omnios.org/).

Currently, I create a bhyve config stanza (and define either one of my pass through devices or a viona netlink), then fetch the cloud-init config from the cloud-init metadata service I now run in a jail:
```
    acpi_tables=false
    acpi_tables_in_memory=false
    memory.wired=true
    memory.size=8G
    x86.verbosemsr=false
    x86.vmexit_on_hlt=true
    lpc.fwcfg=bhyve
    lpc.com1.path=/dev/nmdm1A
    uuid=86151d3c-edba-4446-b29b-ac7ddaded73a
    destroy_on_poweroff=false
    system.manufacturer=FreeBSD
    system.product_name=FreeBSD HVM
    system.version=1.0
    system.serial_number=ds=nocloud-net;s=http://10.163.0.99:8000/bsd/guestvm2;i=86151d3c-edba-4446-b29b-ac7ddaded73a
    system.sku=001
    system.family_name=Virtual Machine
    cpus=4
    sockets=1
    cores=2
    threads=2
    bootrom=/usr/local/share/edk2-bhyve/BHYVE_UEFI.fd
    pci.0.0.0.device=hostbridge
    pci.0.0.0.model=i440fx
    pci.0.1.0.device=lpc
    pci.0.3.0.device=ahci
    pci.0.4.0.device=nvme
    pci.0.4.0.path=/dev/zvol/zroot/bhyve/guestvm2/root
    pci.0.6.0.device=passthru
    pci.0.6.0.bus=183
    pci.0.6.0.slot=0
    pci.0.6.0.func=1
    pci.0.30.0.device=fbuf
    pci.0.30.0.vga=off
    pci.0.30.0.unix=/tmp/vm.vnc
    pci.0.30.1.device=xhci
    pci.0.30.1.slot.1.device=tablet
    pci.0.10.0.device=virtio-rnd
    name=guestvm2
```

Then I connect to the bhyve with the cu command, and exits with ```~~.``` (one escape ~ for each layer, and as I ssh to my host...) similar to how I exit out of a bhyve zone in illumos. What I don't really like, so far, is the current workflow and then the addressing of the console device.

In tmux I start the guest in one pane:
```
    bhyve -k guestvm2
    fbuf frame buffer base: 0xcfa36000000 [sz 33554432]
    wrmsr to register 0x140(0) on vcpu 0
    rdmsr to register 0x4e on vcpu 0
    wrmsr to register 0x140(0) on vcpu 2
    [.. truncated output]
```

Then in another pane I connect to the console:
```
    #  cu -l /dev/nmdm1B
    Connected
    
    e0c85107-61b6-48cc-96eb-54cae1fc1246 login: ~
    [EOT]
```

That's (mostly) fine, but then I have to remember to ```bhyvectl --destroy --vm=guestvm2``` and then declaration of the console. I'll look into running bhyve in the jail instead, as that would (hopefully) give a static way of adressing the guest (perhaps jexec -u root <bhyveguest> cu -l /dev/ndm1B?), which I could create  a wrapper for.

## OpenZFS - rebased @Linux or @illumos?

I'm not up to speed about the Linux rebased OpenZFS, but I would not chose those features to store my precious data as I saw something about dataloss in the Linux and FreeBSD encrypted datasets some year ago.

What currently annoyed (with either jails or the dataset), is that after I stop a jail (with ```service jail stop thejail``` ), I get into this issue :
```
    # zfs destroy zroot/jails/containers/thejail
    cannot unmount '/jails/containers/thejail': pool or dataset is busy
    The jail seemingly gone (and looking at zpool iostat 1 shows no activity):
    # ps -J thejail
    ps: Invalid jail id: thejail
```

Besides that, the pool performance seem to be great. Better than I previously had in illumos (I believe that the sequencial rate is double):
```
    # pv noble-server-cloudimg-amd64.img.raw > /dev/zvol/zroot/bhyve/guestvm2/root
    3.50GiB 0:00:03 [1.14GiB/s] [========================================================================================================================================================>] 100%
```

---

What have I disovered so far? Will I abandon OmniOS (illumos) or FreeBSD? or even Linux? Certainly not, each of them has it's strenghts and adds to the diversity of open source (I actually find it a bit scary when there are parts of the Linux community that want's to go full scale MS Windows and abandon POSIX, from one balrog to another..). 

---

I might do a video to recap what I discovered in some day (or perhaps two)...



