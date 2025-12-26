---
title: Uwubernetes — Kubernetes v1.30 for illumos, OpenBSD (& FreeBSD)
description: "Kubernetes v1.30 was released yesterday and although I have explored some interesting features in the upcoming Cilium v1.16 release..."
pubDatetime: 2024-04-18T20:11:46.030Z
draft: false
tags: [FreeBSD, Kubernetes, illumos, OpenBSD, homelab]
---

![Uwubernetes (espresso, the cat) - logo for Kubernetes v1.30](/assets/k8s130-uwubernetes.png)_Uwubernetes - logo for Kubernetes v1.30_

---

Kubernetes v1.30 was released yesterday and although I have explored some interesting features in the upcoming Cilium v1.16 release, I have not put down steps for it in words, yet. I intend to rewrite the illumos part a bit. Adapt it to instead include auto-node join and try to simplify the steps after my experience with getting a control plane in FreeBSD up and running.

About two weeks ago I finally received a Turing RK1 module (Rockchip RK3588) that I ordered during my vacation in July and I’m one step closer to proceed with a plan I had hoped to get started with during the winter — to have my worker nodes running on metal instead of running as bhyve guests.

Not that there’s something wrong with bhyve, not at all! Especially not considered the nvme backend performing rather well, as seen here — a quick sample from the first reasonable web search hit I found, so take this for what it is (https://medium.com/@krisiasty/nvme-storage-verification-and-benchmarking-49b026786297), but this is on a virtual guest with 4G memory and 4 virtual cores. Way better than my experience on the virtio backend:


    cat << EOF > nvme-seq-read.fio 
    [global]
    name=nvme-seq-read
    time_based
    ramp_time=5
    runtime=30
    readwrite=read
    bs=256k
    ioengine=libaio
    direct=1
    numjobs=1
    iodepth=32
    group_reporting=1
    [nvme0]
    filename=/dev/nvme0n1
    EOF
    
    fio nvme-seq-read.fio
    nvme0: (g=0): rw=read, bs=(R) 256KiB-256KiB, (W) 256KiB-256KiB, (T) 256KiB-256KiB, ioengine=libaio, iodepth=32
    fio-3.28
    Starting 1 process
    Jobs: 1 (f=1): [R(1)][100.0%][r=400MiB/s][r=1598 IOPS][eta 00m:00s]
    nvme0: (groupid=0, jobs=1): err= 0: pid=3674: Thu Apr 18 19:57:37 2024
      read: IOPS=3015, BW=754MiB/s (791MB/s)(22.1GiB/30006msec)
        slat (usec): min=20, max=98618, avg=324.23, stdev=518.38
        clat (msec): min=2, max=123, avg=10.28, stdev= 8.47
         lat (msec): min=2, max=124, avg=10.61, stdev= 8.72
        clat percentiles (msec):
         |  1.00th=[    3],  5.00th=[    4], 10.00th=[    4], 20.00th=[    4],
         | 30.00th=[    4], 40.00th=[    5], 50.00th=[    8], 60.00th=[   11],
         | 70.00th=[   14], 80.00th=[   18], 90.00th=[   22], 95.00th=[   26],
         | 99.00th=[   36], 99.50th=[   40], 99.90th=[   49], 99.95th=[   61],
         | 99.99th=[  124]
       bw (  KiB/s): min=293450, max=1670656, per=100.00%, avg=779886.51, stdev=430755.05, samples=59
       iops        : min= 1146, max= 6526, avg=3046.14, stdev=1682.62, samples=59
      lat (msec)   : 4=38.08%, 10=21.05%, 20=27.28%, 50=13.55%, 100=0.04%
      lat (msec)   : 250=0.03%
      cpu          : usr=2.40%, sys=97.55%, ctx=191, majf=0, minf=58
      IO depths    : 1=0.0%, 2=0.0%, 4=0.0%, 8=0.0%, 16=0.0%, 32=100.0%, >=64=0.0%
         submit    : 0=0.0%, 4=100.0%, 8=0.0%, 16=0.0%, 32=0.0%, 64=0.0%, >=64=0.0%
         complete  : 0=0.0%, 4=100.0%, 8=0.0%, 16=0.0%, 32=0.1%, 64=0.0%, >=64=0.0%
         issued rwts: total=90489,0,0,0 short=0,0,0,0 dropped=0,0,0,0
         latency   : target=0, window=0, percentile=100.00%, depth=32
    
    Run status group 0 (all jobs):
       READ: bw=754MiB/s (791MB/s), 754MiB/s-754MiB/s (791MB/s-791MB/s), io=22.1GiB (23.7GB), run=30006-30006msec
    
    Disk stats (read/write):
      nvme0n1: ios=101251/713, merge=0/304, ticks=295519/1964, in_queue=297518, util=99.78%


And this one:


    cat << EOF > nvme-rand-read.fio
    [global]
    name=nvme-rand-read
    time_based
    ramp_time=5
    runtime=30
    readwrite=randread
    random_generator=lfsr
    bs=4k
    ioengine=libaio
    direct=1
    numjobs=16
    iodepth=16
    group_reporting=1
    [nvme0]
    new_group
    filename=/dev/nvme0n1
    EOF
    fio
    EOF
    
    fio nvme-rand-read.fio
    nvme0: (g=0): rw=randread, bs=(R) 4096B-4096B, (W) 4096B-4096B, (T) 4096B-4096B, ioengine=libaio, iodepth=16
    ...
    fio-3.28
    Starting 16 processes
    Jobs: 16 (f=6): [f(2),r(2),f(4),r(1),f(4),r(3)][3.7%][r=349MiB/s][r=89.4k IOPS][eta 15m:43s]
    nvme0: (groupid=0, jobs=16): err= 0: pid=4845: Thu Apr 18 20:02:18 2024
      read: IOPS=87.6k, BW=342MiB/s (359MB/s)(10.0GiB/30021msec)
        slat (usec): min=15, max=181136, avg=162.29, stdev=1669.78
        clat (usec): min=2, max=181964, avg=2752.86, stdev=6578.19
         lat (usec): min=53, max=182049, avg=2916.97, stdev=6752.52
        clat percentiles (usec):
         |  1.00th=[  461],  5.00th=[  482], 10.00th=[  498], 20.00th=[  519],
         | 30.00th=[  553], 40.00th=[  660], 50.00th=[  693], 60.00th=[  717],
         | 70.00th=[  742], 80.00th=[  865], 90.00th=[ 3163], 95.00th=[24511],
         | 99.00th=[25035], 99.50th=[28443], 99.90th=[32900], 99.95th=[36963],
         | 99.99th=[69731]
       bw (  KiB/s): min=298836, max=383848, per=100.00%, avg=350382.76, stdev=994.23, samples=944
       iops        : min=74709, max=95962, avg=87595.24, stdev=248.57, samples=944
      lat (usec)   : 4=0.01%, 10=0.01%, 50=0.01%, 100=0.01%, 250=0.01%
      lat (usec)   : 500=11.78%, 750=59.74%, 1000=13.71%
      lat (msec)   : 2=4.74%, 4=0.07%, 10=0.63%, 20=1.99%, 50=7.34%
      lat (msec)   : 100=0.02%, 250=0.01%
      cpu          : usr=2.99%, sys=21.95%, ctx=18056, majf=0, minf=932
      IO depths    : 1=0.0%, 2=0.0%, 4=0.0%, 8=0.0%, 16=100.0%, 32=0.0%, >=64=0.0%
         submit    : 0=0.0%, 4=100.0%, 8=0.0%, 16=0.0%, 32=0.0%, 64=0.0%, >=64=0.0%
         complete  : 0=0.0%, 4=100.0%, 8=0.0%, 16=0.1%, 32=0.0%, 64=0.0%, >=64=0.0%
         issued rwts: total=2628389,0,0,0 short=0,0,0,0 dropped=0,0,0,0
         latency   : target=0, window=0, percentile=100.00%, depth=16
    
    Run status group 0 (all jobs):
       READ: bw=342MiB/s (359MB/s), 342MiB/s-342MiB/s (359MB/s-359MB/s), io=10.0GiB (10.8GB), run=30021-30021msec
    
    Disk stats (read/write):
      nvme0n1: ios=3062520/15, merge=0/3, ticks=169941/3, in_queue=169944, util=99.61%


But bare metal on a couple of RK1 is still interesting for me, just the potential of having the Turing PI (through an API) boot/halt the tiny nodes on request, through some custom node autoscaler.. energy/noise/heat would really be in my favour. Well, that is one goal.

Another goal of mine is to explore Talos, Pulumi, Dagger and some other projects a bit further. Time is a constraint I guess we all have to deal with.

As I mentioned initially, I’ve been looking into the upcoming v1.16 release of Cilium and one (of the many) goodies is the ability to announce ClusterIP CIDR to the network. This should probably excite a couple of you as much as it excites me! This means that the worker nodes can register themselves dynamically without any special route trickery. I haven’t went into depth with this yet, but here’s a teaser:


    vtysh -c 'show ip route' |grep '10.22.14'
    K>* 0.0.0.0/0 [0/0] via 10.22.14.62, enp0s6f1, 00:58:52
    B>* 10.0.0.0/24 [20/0] via 10.22.14.12, enp0s6f1, weight 1, 00:54:18
    B>* 10.0.1.0/24 [20/0] via 10.22.14.11, enp0s6f1, weight 1, 00:54:33
    B>* 10.0.2.0/24 [20/0] via 10.22.14.15, enp0s6f1, weight 1, 00:54:38
    C>* 10.22.14.0/26 is directly connected, enp0s6f1, 00:58:52
    B>* 10.96.0.1/32 [20/0] via 10.22.14.11, enp0s6f1, weight 1, 00:54:18
      *                     via 10.22.14.12, enp0s6f1, weight 1, 00:54:18
      *                     via 10.22.14.15, enp0s6f1, weight 1, 00:54:18
    B>* 10.96.0.10/32 [20/0] via 10.22.14.11, enp0s6f1, weight 1, 00:54:18
      *                      via 10.22.14.12, enp0s6f1, weight 1, 00:54:18
      *                      via 10.22.14.15, enp0s6f1, weight 1, 00:54:18
    B>* 10.97.113.249/32 [20/0] via 10.22.14.11, enp0s6f1, weight 1, 00:54:18
      *                         via 10.22.14.12, enp0s6f1, weight 1, 00:54:18
      *                         via 10.22.14.15, enp0s6f1, weight 1, 00:54:18
    B>* 10.99.55.64/32 [20/0] via 10.22.14.11, enp0s6f1, weight 1, 00:54:18
      *                       via 10.22.14.12, enp0s6f1, weight 1, 00:54:18
      *                       via 10.22.14.15, enp0s6f1, weight 1, 00:54:18
    B>* 10.99.233.82/32 [20/0] via 10.22.14.11, enp0s6f1, weight 1, 00:54:18
      *                        via 10.22.14.12, enp0s6f1, weight 1, 00:54:18
      *                        via 10.22.14.15, enp0s6f1, weight 1, 00:54:18
    B>* 10.105.105.220/32 [20/0] via 10.22.14.11, enp0s6f1, weight 1, 00:54:18
      *                          via 10.22.14.12, enp0s6f1, weight 1, 00:54:18
      *                          via 10.22.14.15, enp0s6f1, weight 1, 00:54:18
    B>* 10.107.197.40/32 [20/0] via 10.22.14.11, enp0s6f1, weight 1, 00:54:18
      *                         via 10.22.14.12, enp0s6f1, weight 1, 00:54:18
      *                         via 10.22.14.15, enp0s6f1, weight 1, 00:54:18


Another goal of mine is that I’m consolidating my two ZFS arrays with 40k+ Power_On_Hours into a new ZFS array with two attached mirrors. Fourteen disks will become four when I’m done with this. I have bought two disks from two vendors with a couple of months between the purchases, the disks have been powered on for varying amount of hours and so on (as I usually do with my disk purchases, actually two of the disks in my zones array are bough on Ebay just for the sake of having a different history).

Hopefully the risk of simultaneous failure will be mitigated, but this isn’t anything I want to rush. In the old array much of the data is redundant and fragmented as I, in the early days, took a backup of whole (sometimes failing) disks as images as I felt uncertain if the data was consistent. There are also ancient stuff as my old LXC environments that I will most certainly never again need (hoarding habits) with things like Debian sarge or earlier Fedora. rsync copies from mobiles and computers (not just home directories). Photos that were saved onto the first available USB-disk. A data nightmare that was created several years ago is in progress of being taken care of.


            NAME                       STATE     READ WRITE CKSUM
            zones                      ONLINE       0     0     0
              mirror-0                 ONLINE       0     0     0
                c0t5000C500AFDAEAF5d0  ONLINE       0     0     0
                c0t5000C500ED99A7B1d0  ONLINE       0     0     0
              mirror-1                 ONLINE       0     0     0
                c0t5000C500B216AB2Ed0  ONLINE       0     0     0
                c0t5000C500A5A08FDEd0  ONLINE       0     0     0
              mirror-2                 ONLINE       0     0     0
                c0t5000C500B27CE01Ad0  ONLINE       0     0     0
                c0t5000C500B1B036F6d0  ONLINE       0     0     0
              mirror-4                 ONLINE       0     0     0
                c0t50014EE25F0AC6DFd0  ONLINE       0     0     0
                c0t50014EE209BD7762d0  ONLINE       0     0     0
    
            NAME                       STATE     READ WRITE CKSUM
            domniosce                  ONLINE       0     0     0
              raidz2-0                 ONLINE       0     0     0
                c0t50014EE20E090574d0  ONLINE       0     0     0
                c0t50014EE2BAF0E656d0  ONLINE       0     0     0
                c0t50014EE65AAF5CCCd0  ONLINE       0     0     0
                c0t50014EE00376F6D6d0  ONLINE       0     0     0
                c0t50014EE605959C0Dd0  ONLINE       0     0     0
                c0t50014EE003772D83d0  ONLINE       0     0     0
    
    for i in $(ls /dev/rdsk/c0t500*d0); do smartctl -a ${i} |grep Power_On; done
      9 Power_On_Hours          0x0032   041   041   000    Old_age   Always       -       52068 (173 109 0)
      9 Power_On_Hours          0x0032   046   046   000    Old_age   Always       -       47657 (250 35 0)
      9 Power_On_Hours          0x0032   047   047   000    Old_age   Always       -       47064 (239 141 0)
      9 Power_On_Hours          0x0032   046   046   000    Old_age   Always       -       47657 (72 75 0)
      9 Power_On_Hours          0x0032   047   047   000    Old_age   Always       -       47066 (72 228 0)
      9 Power_On_Hours          0x0032   086   086   000    Old_age   Always       -       12564
      9 Power_On_Hours          0x0032   044   044   000    Old_age   Always       -       41106
      9 Power_On_Hours          0x0032   044   044   000    Old_age   Always       -       41073
      9 Power_On_Hours          0x0032   008   008   000    Old_age   Always       -       67227
      9 Power_On_Hours          0x0032   020   020   000    Old_age   Always       -       58829
      9 Power_On_Hours          0x0032   008   008   000    Old_age   Always       -       67248
      9 Power_On_Hours          0x0032   040   040   000    Old_age   Always       -       44322
      9 Power_On_Hours          0x0032   001   001   000    Old_age   Always       -       75732
      9 Power_On_Hours          0x0032   001   001   000    Old_age   Always       -       73562



But over to the news of the day — Uwubernetes was released yesterday!

I’m happy to announce that I’ve successfully ported over the current release (v1.30) of Kubernetes to illumos and OpenBSD (and also, compiled the binaries for FreeBSD).


    _output/bin/kubectl version -o yaml
    clientVersion:
      buildDate: "2024-04-18T16:51:06Z"
      compiler: gc
      gitCommit: 31799cad5ddf385f14b01fc81df99a662a54c9d2
      gitTreeState: clean
      gitVersion: v1.30.0-2+31799cad5ddf38
      goVersion: go1.22.2
      major: "1"
      minor: 30+
      platform: illumos/amd64
    kustomizeVersion: v5.0.4-0.20230601165947-6ce0bf390ce3


Fetch the source/binaries at my GH repo https://github.com/tnorlin/kubernetes/releases

So this ended up being a post about procastrination and few results, but at least I posted a teaser.
