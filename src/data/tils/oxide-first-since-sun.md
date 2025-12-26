---
title: Oxide is the first computer company since SUN
author: Tony Norlin
description: "Today I learned that Oxide Computer Company is the first computer company since SUN Microsystems."
pubDatetime: 2023-09-08T14:13:51.279Z
tags: [suntember, omnios, sun, solaris, oxide, illumos]
draft: false
---

import { YouTube } from "astro-embed";

After watching this [Youtube - Sun Microsystems Founders Panel](https://youtu.be/dkmzb904tG0?t=2895)
clip I learned something...

> That's interesting, there haven't been any other computer companies that started after SUN, we were the last computer companies.. server companies..

Those were the words of Scott McNealy during a panel in January 2006 and that made me realize that Oxide Computer Company now is the first computer company since SUN Microsystems! So long time, 40 years, served with only Personal Computer (PC) resellers...

<YouTube id="https://youtu.be/dkmzb904tG0?t=2895" />

While Oxide don't design their own CPU (yet? ..but if that is a criteria, none is actually a computer company anymore), they are designing and building just about everything else in their rack and with a great sense in both details and estetics (I mean, just grabbing the PCI Vendor ID of 01DE makes on think on how far you can stretch):

> #​define PCI_VENDOR_ID_OXIDE 0x1DE

Companies such as Dell and Supermicro are designing Server Boards, but they are mostly assembling it together with some 3rd party hardware and reselling the parts, together with firmware blobs. The end result is a monster that is hard to control.

Bryan Cantrill, CTO of Oxide Computer Company, on [Changelog podcast](https://changelog.fm/496#t=1:03:38):

> ... when they (the customers) buy something from Dell, or from HP, or from Supermicro they then are responsible for putting the software on top of it. It’s like, you’re not running Dell on it’s own, you’re running Dell + VMware; you’re running Dell, plus VMware, plus Cisco, plus software to manage the network. And plus your distributed storage system, whatever that is. And whenever anything goes wrong - well, you assembled this thing, so this is on you. And every vendor points at everyone else. And boy, I lived this; we were Dell customers.

Oxide Computer on the other hand are building something that is possible to debug, and with software published openly on GitHub.

Away with BIOS, UEFI, actually the System Management Mode (SMM) and replace the Baseboard Management Controller with a proper Service Processor (STM32H753) and control it with a rust based open source operating system, [Hubris](https://hubris.oxide.computer/).
The server board/chassis is designed as a sleds (there are up to 32 of them in the rack).
The rack switches are programmable with P4, and traffic routed through either Geneve or BGP [read/hear more at [OpenNetworking Blog](https://opennetworking.org/news-and-events/blog/building-a-rack-scale-computer-with-p4-at-the-core/) [slides](https://opennetworking.org/wp-content/uploads/2023/08/oxide-p4-dev-days-talk.pdf)].
The operating system Helios (not to confuse with the discontinued HeliOS, but namings are probably for a reason), an illumos operating system based on OmniOS. The Control Plane is called [Omicron](https://github.com/oxidecomputer/omicron).

As of this summer they have shipped their first rack to a real customer!

I've been following Oxide's journey since their first announcement (which were rather scarce during the first years and led to a couple of speculations) and I believe the end result presented is about something way better than I could've imagined. I knew it would be something based on illumos and bhyve, but that's where my imagination stopped.

In the end of 2021 I had some wild guesses and my speculations even made me bottle up a glass of wine at a late Friday night and attempting to get Kubernetes v1.23.0 up and running on illumos, as I speculated that some load naturally would be k8s and a integrated control plane could be of good use - to my surprise I managed to have components of the control plane up and running (but kube-proxy was troublesome). Now it seems that all the workload will be bhyve guests after all, but it seems that no workload in zones. Not that it rules out the possibilites of having workload related components running in non-global zones.. all the answers are in the various GIT repositories, such as the [omicron1 branded zone type](https://github.com/oxidecomputer/helios-omicron-brand)...

> A couple of months ago I had a busy weekend to toy around with a concept I though that Oxide Computer Company would bring (although, I believe they will actually excel beyond expectations as they go all in on API everywhere). I had a new shot with the concept last weekend and now have a fully functional controlplane on illumos (OmniOS) with Kubernetes v1.23.0. Thanks to the excellent CNI that Cilium create, my Linux workers thrive on the workload I have thrown at them.
> https://www.linkedin.com/posts/tonynorlin_kubernetes-the-hard-illumos-way-last-part-activity-6878295873558720512-7N-y?utm_source=share&utm_medium=member_desktop

Read and listen to Oxide's current podcast, Oxide and Friends - https://oxide.computer/podcasts/oxide-and-friends. Before the company formed for real they had another podcast, filled with legends, On the Metal https://oxide.computer/podcasts/on-the-metal. You will only regret that you haven't listened to the gold material earlier.

Also, Bryan Cantrill (who shouldn't need a further introduction) is a rather popular guest in various podcasts, universities and conferences, as well are other employees of Oxide, and not to forget, they have (228! public) repositories on GitHub https://github.com/oxidecomputer/. Their home page https://oxide.computer/ has more specs.
