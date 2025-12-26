---
title: Twenty years of home lab
author: Tony Norlin
description: A reflection on my twenty years as a home lab tinkler.
featured: true
pubDatetime: 2024-11-20T20:05:15.922Z
draft: false
tags:
  - kubernetes
  - networking
  - illumos
  - homelab
keywords:
  - cilium
  - illumos
  - kubernetes
  - networking
  - homelab
---

I moved to a house (from a rented apartment) during the summer, and while going through the tough ritual of getting rid of stuff, I opened the old boxes with ancient computing gear (it did not go so well, but at least I managed to scrap a couple of hard drives, though):

![Some thirty-something drives](/assets/disk-stack.png)_Some thirty-something drives_

While doing this, I came to realize one thing - this year marks 20 years since I bought my first hardware dedicated to serve the household and without a monitor attached to it. Before that point, I had one computer - my workstation and I had that period of opting between the various Linux distributions and as I advanced, dual booting between Linux and FreeBSD and sometimes emulate other OS with VMware Player / Bochs.

I even did buy a couple of SUN Sparcstation 5 (I believe it was during 2002), together with a colleague, that earlier had been part of a beowulf cluster a couple of years earlier. While cool, I did not find any good use after I managed to successfully PXE-boot (I had no removable installation options available) and install the machine.

## The first server

For me, it all began with a ASUS Pundit-R barebone (I believe it was one of the first computers sold as the category "barebone"), which meant chassis, PSU and motherboard sold together as one unit.

Reading a sponsored(??) article in one of the popular review sites, somewhere in the world wide web, I immediately got a vision that this sleek and tiny computer had to be the ideal server (on my restrained budget) on top of the IKEA PAX wardrobe that were my computing corner at that time.

![the kubernaut - home labbing year 2004.](/assets/author-2004.png)_the kubernaut - home labbing year 2004._

Little did I know back then, what the combination of a 80 mm fan and heat dissapating in a tiny box would result in noise, especially during nights (and when I forgot to set the CPU governor to powersave mode). The computer fans would rev up momentarily whenever there were any processing tasks, such as transcoding after recording a show. My girlfriend had little to no understanding of the nightly tasks, so it had me to learn (to set up cronjobs and) minimize the footprint of the server.

The computer, running on Debian, served as the firewall, router, webmail (squirrelmail + dovecot + ldap), mail fetcher (I had my own domain), NFS share, music server, DVR (first in analogue format, then in the digital DVB-C format, with mythbackend), SSH server (but things got problematic if the IP had changed after leaving the home), and as a generic download archive.

Performance suffered a lot whenever I was trying to run a virtual machine for VPN (virtualbox), so that's how I discovered LXC (and that's when I got into containers in Linux).

## Going portable

When the ASUS Eee PC 701 was launched (in Germany), it was the first time ever I ordered stuff from abroad. This became my mobile battle station. Commuting by train and equipped with a UMTS-modem hooked on to the netbook with a USB dongle, I connected the Eee PC 701 to my home over Nomachine NX, through SSH jailkit to my LXC container running Debian with Windowmaker.

## New server - this time passively cooled

Some lesson was learned regarding noise levels and the next server purchased was a motherboard in ITX-format powered by a passively cooled VIA Eden 1000MHz. It had some onboard slot (PCIe??) where I installed a wireless card, together with an external antenna, so now it was also my wireless access point.

While it was dead silent and ultra low in power consumption, it also turned out to be remarkable slow for some tasks (such as serving NFS shared home directories)!

However, the lack of performance was slowly killing me and I built a new server, this time with the i7–2600k (I weren't updated on the vt-d extension, though) together with fans from Noctua - this one was silent and performed well enough.. until I wanted to start more than two virtual machines. At the same time I also bought my very first dedicated router, a Mikrotik MT-RB751G.

A couple of years later I decided to turned my looks to Ebay and ordered a cheap Dell r710, and the rest is history..

## Switching over to illumos and OmniOS

During the first twelve years the infrastructure has primarily been served by Debian, but the last eight years have been based on OmniOS and I have no plans on changing that as the combination of illumos, bhyve, crossbow and ZFS is a good treat to me. I have bought new (well, new to me, but mostly used - from Ebay) hardware, with the intention that it should be running Debian, but after a couple of weeks (days) I feel a lack of refinement (sorry) and there goes OmniOS on that one too (I do run Linux of some distribution on my laptop).

## What about Kubernetes?

During the last couple of years, Kubernetes have my fullest attention (it's my dayjob after all and I do love working with it) and I find the eco system around it to be extremely inspiring and exciting. With that said, I do plan to move more of the workload to k8s, but I find it irrational to replace each and every function in the home infrastructure to a cloud native design. Or? Certainly, I could migrate all my workload as VMs in KubeVirt and enjoy the abilities such as live migration. On the other hand, instead of (efficient) OS virtualization the VM add another layer of overhead and instead of Crossbow dealing with VLANs and link aggregations I would turn to Multus, macvtap or CNI.. by the way, what about the storage? ..as the 100% home infrastructure, I'm not convinced yet.

I do have hardware where I tinker with Kubernetes in various shapes (Sidero Talos, kind, vanilla kubeadm, rancher, and my own creation mentioned below)

## Services powering the household

Among the services that powers our home the following services run 24/7 on three different servers running OmniOS (one being the storage server) are these:

- home assistant (hassos, currently running as a bhyve vm, following their recommendations with docker containers. I had core running as python venv in lipkg zone until they redesigned a couple of years ago)
- pfSense (running as a bhyve vm, primary wan)
- pfSense (running as a bhyve vm, secondary wan)
- dhcp (as a lipkg zone)
- frr (as a bhyve vm)
- imap (as a lipkg zone)
- internal DNS resolver internal - primary (bind9 in a lipkg zone)
- internal DNS resolver internal - secondary (bind9 in a lipkg zone)
- internal DNS resolver external - primary (bind9 in a lipkg zone)
- jump server (as a bhyve vm)
- outgoing squid proxy (as a likg zone)
- remote syslog "loadbalancer" (as a lipkg zone, sending to both logservers)
- remote logserver1 (as a lipkg zone)
- remote logserver2 (as a lipkg zone)
- tailscale (as a lipkg zone, in a vlan connected to primary wan)
- tailscale (as a lipkg zone, in a vlan connected to secondary wan)
- pihole1 (kids, as a bhyve vm)
- pihole2 (adult, as a bhyve vm)
- adguard (as a bhyve vm)
- smtp (as a lipkg zone)
- unifi (access point, as a lx zone)
- wireguard (as a bhyve vm - external access - primary wan)
- wireguard (as a bhyve vm - external access - secondary wan)
- bind9 slave
- bind9 slave
- gobuilder (as a lipkg zone)
- internal DNS resolver (unbound in a lipkg zone, resolving to root servers)
- minecraft server (as a lx zone)
- vaultwarden (as a lipkg zone)
- postgresql (as a lipkg zone)
- openvpn (as a lipkg zone)
- wireguard (as a lipkg zone - out of bands network)
- radius (as a lipkg zone)
- tftp (as a lipkg zone)

Was that all?? No, I do have a couple more services running as sparse, pkgsrc, lx or bhyve vms.. but those were the ones I believe worth mentioning.

What about outages? Hardware failures, besides spinning disks with UNC's have been rare. Two flash drives have failed, one being the Crucial MX500 (controller failed after less than 50 hours, which in this case was 1–2 years of ocassional usage). Since I went for the Supermicro X10/X11 series (Intel Xeon D) motherboards, the only outtages have been during upgrades and planned downtimes.

## Network segmentations

I know its old school, but there's a couple of VLANs in place to separate roles/visitors:

- OOB / mgmt network
- core infrastruture
- logging
- tailscale
- jump server
- IOT / cameras (should be on its own)
- radius / security
- clients
- work
- guests
- LTE
- etc.. plus a dozen more for various labs/demos/locked-in environments.

## Would it eventuallly be possible to run Kubernetes on illumos?

Three years has passed since I first layed the ground on my Kubernetes control plane running on illumos. This was based on a loose speculation I had, with what I believed Oxide Computer would announce in the coming months as they seemed to finally release the complete picture of their solution.

As they had Jessie (Jess Frazelle, famous for container sorcery) onboard, I guessed that there would probably be containers running underneath in some form, and that Oxide probably would create a solution with an integrated kubernetes control plane to attract cloud-like designs - it turned out that I could not be more wrong on that. At least on the containers.

It doesn't matter, this was my catalyst for exploring the possibilities on my own instead of adapting to a finished solution.

## Successful port of the Kubernetes control plane on illumos

I had crawled the public web a couple of times at this point to see whether anyone had succeeded on having k8s up and running on illumos, and the closest thing I saw -  there were attempts on compiling the components, but it didn't look like someone actually ran the binaries.

Now that I got had that idea stuck in my head, I decided to go ahead myself. After mixing bits and pieces that I managed to find, I first managed to compile the kubectl command, and then the etcd. When I finally managed to compile the apiserver after a glass of wine one late night and also had it responding to requests, I could not believe my eyes and I were beyond excitement (and had a hard time going to bed and sleep).

Attempts to have a virtual kubelet connected to the cluster went well, but I could not get it to do anything useful and I decided to have a Linux worker node instead - a simple pod was deployed without any effort.

The big issue was to have the apiserver talking to kubelet for retrieving logs, or to enable inbound traffic to the pods I've managed to deploy.

## Cilium to the rescue

I recalled that I, some year earlier, tried Cilium briefly in Rancher and that it had a eBPF implementation that didn't require a kube-proxy, and I felt that one component less to care about could be a way forward - it turned out to be a winner for me, and that's how I fell in love with Cilium. I had my cluster up and running!

It wasn't without issues, though. As dynamic admission controllers acts as a part of the control plane, but runs in the data plane (and often with a specification that points the webhook to a named cluster-internal (ClusterIP) service). To solve it, I modified the admission controller webhooks to talk to an "external service" (DNS address), at which I had haproxy as a frontend with the tcp mode to forward the https request. For most operators it worked, but some were tougher..

When Cilium announced the sidecar-less beta, things were starting to look very good for my use case and with BGP routing in place I could use ingress controllers and nearly everything that I expected of a Kubernetes cluster would behave quite well.

## Recreation

Three years later, I feel that it's about time to recreate my home infra cluster, not because I have any current issues with my current setup - it has been up and running without any bigger glitches\*, but I haven't ran anything "important" in it and I want a fresh start (this time with bare metal worker nodes as I want more experience with KubeVirt).

**\*glitches**:

- During this time, my biggest pain point were the months before the v1.26 release as I had my storage running on Longhorn.
  The project had trouble keeping up with the deprecation of Pod Security Policies and they were doing bigger changes (redesigning their dynamic admission controllers I noticed) and to keep up with k8s I decided to apply the master branch of Longhorn - it turned out to be a big mistake and at one point when a storage node were unavailable, the longhorn operator wanted to create storage replicas up to the point that I had almost 200 000 longhornreplicas. The kubectl commands were stalling, and within a couple of minutes, apiserver was killed due to my memory limit of 12G (!!). I had big troubles for a while.

Two things learned from that:

- The gitaly component of Gitlab were vital for a functional Gitlab in k8s. It could have been good if I had done more recent backups…).
- I believe that's the point when I learned more about defragmentation of etcd and how it restored performance, but unfortunately I weren't aware of its efficiency at that critical moment and I restored to an earlier etcd snapshot and left a couple of objects inconsistent.

I created my certificates (on purpose) with short life to investigate the effects and behaviour of the cluster, and mostly it was obvious traces in logs and sometimes - like when scheduler went down because it could no longer talk to the apiserver.

Outside of that, I can't remind myself of any issues in the control plane, even though I deliberately chose to run apiserver, scheduler and controller-manager as single instances. The control plane components starts as zones automatically during server boot and are, with exceptions of binary upgrades, maintenance free.

After Cilium finally merged #9207 into main branch (upcoming v1.17 release), I've managed to run the CNCF conformance test and pass 100% and this has been both my personal goal as well as a goal for service providers that wants to offer solutions with a Cilium Service Mesh - look out in the beginning of next year, more options to the people (no, there will be no illumos/BSD offerings! - I won't even try to convince my colleagues)!

But back to my homelab. This time I'm creating multiple instances of the control plane components and I will put the apiserver behind a load balancer, to be more like the ordinary Linux environments. But it's no practical purpose and more for the sake of fun. While I do have multi WAN, I haven't enabled CARP in pfSense for client VLANs - if my main router is down, I have no bigger use of a control plane anyway..

## Cloud-native storage

For me, the storage has been the biggest hurdle to solve, with regards of Kubernetes in homelab environment.

What kind of storage provides enough resilience, performance and at the same time acts rather conservative with resource consumption?

A rational step would be to evaluate the CNCF landscape and begin with the ones that passed the chasm and work downwards:

- Rook (graduated)
- CubeFS (incubating)
- Longhorn (incubating)
- Carina (sandbox)
- Curve (archived)
- HwameiStor (sandbox)
- K8up (sandbox)
- Kanister (sandbox)
- OpenEBS (sandbox)
- ORAS (sandbox)
- Piraeus Datastore (sandbox)
- Vineyard (sandbox)

Rook (ceph): Well, consumer NVME (which I now recently bought for my worker nodes) is a no-go for ceph performance. I have enterprise NVME in two of the servers, but then it's this thing with virtual storage that I would like to avoid..

CubeFS: Uncertain about that one. Unknown list of adopters.

Longhorn: I believe that my troubles with Longhorn in the past was a unique happening, but I'm not convinced about the performance. Otherwise a reasonable choice.

Carina what? One unknown adopter and non working blog. Next!

HwameiStore: A bunch of "The actual names cannot be made public due to privacy policies"

K8up: It's backups, not a storage

Kanister: Not a storage, it's a framework

OpenEBS (Mayastor): Interesting, but they don't support live migrations (as of now) and ARM64 (I have a RK3588 that I would prefer to utilize) seem to be a no-go for now.

ORAS: "OCI registry client"

Piraeus: "The Piraeus Operator manages LINSTOR clusters in Kubernetes.", it mentions a lot about open source, but I don't get an open source feeling about this.

Vineyard: "…is an in-memory immutable data manager"

How about other options? democratic-csi is not in the CNCF landscape, but open source. They have OpenZFS support. Well, I have OpenZFS externally available, but this runs on illumos so.. no democratic-csi for me after all (I did try TrueNAS a while, as a bhyve guest, but I'm against putting the storage in a virtualized tenant as it performed subpar).

So my bets are OpenEBS/Mayastor or Longhorn..
