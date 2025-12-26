---
title: Welcome Mandala! (Kubernetes v1.29) on FreeBSD Control Plane
description: "To celebrate the release of Kubernetes v1.29 - Mandala - I decided to go ahead and install it on FreeBSD as a control plane!"
pubDatetime: 2023-12-13T11:11:46.030Z
draft: false
tags: [FreeBSD, Kubernetes, ETCD]
---

![Mandala (The Universe) - logo for Kubernetes v1.29](/assets/k8s129-mandala-512px.png)_Mandala (The Universe) - logo for Kubernetes v1.29_

---

Kubernetes v1.29 was recently released and I thought it was just about time that I gave it a try on FreeBSD.

---

I'm about to grow/replace one of the storage arrays and have a need to "burn-in"&#185; a new disk, so I decided to finally install FreeBSD on bare metal.

&#185; My procedure is simply that I will let this disk have a couple of hundred flying hours, then I'll buy a new disk in a couple of weeks - from another reseller. I will then "burn-in" that disk, and repeat until I have my disks to form a new array, then I'll send the snapshots over from the old array..).

---

It was way too long ago since I actually had a dedicated FreeBSD up and running more than occasionally, so please bear with me that I might do some controversal maneuvers during my installation, but it's my machine  --  my rules.

I should not need to mention that what you are about to read here is not mature for production and is of experimental nature and for my part just for the sake of having a fun time behind the keyboard.

Some year ago, in my articles on how to stand up a Kubernets control plane on illumos I got a question on how to install the binaries on FreeBSD. My quick response was to show an example on a single node, but I went ahead and tried out virtual-kubelet to deploy an 100% FreeBSD cluster as a concept. Although, it felt appropriate to do an installation in jails as this reminds more on the way I run Kubernetes in illumos at my home infrastructure since a couple of years, well --  better late than never!

## Creation of certificates

I intend to document my concept of auto-joining worker nodes as show in my video here:

[![YouTube Autojoin Workers](/assets/youtube-autojoin-workers.png)](https://www.youtube.com/watch?v=b2c7HNAlxK0)

But until then, here is one way to generate certificates.

### Prerequisites

To follow the instructions, a machine with a fresh release of FreeBSD 14 is needed. Also, the packages gnu-tar, cfssl and bash and ZFS.

The details around it is out of scope, but in short, install pkg by just typing the command (as root) and answer the questions:

    pkg

Then install the required packages (as root):

    pkg install bash cfssl gtar

Fetch/compile/install the Kubernetes binaries from your source of choice:

    fetch -o /var/tmp/ https://github.com/tnorlin/kubernetes/releases/download/v1.29.0-freebsd/kubectl
    fetch -o /var/tmp/ https://github.com/tnorlin/kubernetes/releases/download/v1.29.0-freebsd/kube-apiserver
    fetch -o /var/tmp/ https://github.com/tnorlin/kubernetes/releases/download/v1.29.0-freebsd/kube-controller-manager
    fetch -o /var/tmp/ https://github.com/tnorlin/kubernetes/releases/download/v1.29.0-freebsd/kube-scheduler

Fetch/compile/install the ETCD binaries from your source of choice:

    # I've yet to upload binaries, so either compile (or use the old from ports)
    fetch -o /var/tmp/ https://github.com/tnorlin/etcd/releases/download/v3.5.11-freebsd/etcd
    fetch -o /var/tmp/ https://github.com/tnorlin/etcd/releases/download/v3.5.11-freebsd/etcdctl
    fetch -o /var/tmp/ https://github.com/tnorlin/etcd/releases/download/v3.5.11-freebsd/etcdutl

## The steps to create necessary certificates

Then go ahead and create the certificates. As I've described it in earlier posts and I do have a plan to document another flow, I'll just put the necessary steps here, rather plain.
Note that the names, amount of ETCD are set to three and the IP are set to the 192.168.168.0/24 CIDR (feel free to change the subnet, but keep in mind to do the corresponding on the control plane nodes as well, unless you are routing savy).

As root, type the following (adapt the names/subnets as needed) in a bash shell:

    # Create a placeholder directory structure for CAs and the corresponding certificates
    mkdir -p /var/tmp/k8sbsd/{root-ca,kubernetes-ca,kubernetes-front-proxy-ca,etcd-ca}; cd /var/tmp/k8sbsd

    # Root CA Configuration
    cat << EOF > root-ca/root-ca-config.json
    {
        "signing": {
            "profiles": {
                "intermediate": {
                    "usages": [
                        "signature",
                        "digital-signature",
                        "cert sign",
                        "crl sign"
                    ],
                    "expiry": "26280h",
                    "ca_constraint": {
                        "is_ca": true,
                        "max_path_len": 0,
                        "max_path_len_zero": true
                    }
                }
            }
        }
    }
    EOF

    cat << EOF > root-ca/root-ca-csr.json
    {
        "CN": "my-root-ca",
        "key": {
            "algo": "rsa",
            "size": 4096
        },
        "ca": {
            "expiry": "87600h"
        }
    }
    EOF

    cfssl genkey -initca root-ca/root-ca-csr.json | cfssljson -bare root-ca/ca

    cat << EOF > kubernetes-ca/kubernetes-ca-csr.json
    {
        "CN": "kubernetes-ca",
        "key": {
            "algo": "rsa",
            "size": 4096
        },
        "ca": {
            "expiry": "26280h"
        }
    }
    EOF

    # Intermediate Kubernetes CA
    cfssl genkey -initca kubernetes-ca/kubernetes-ca-csr.json | cfssljson -bare kubernetes-ca/kubernetes-ca
    cfssl sign -ca root-ca/ca.pem -ca-key root-ca/ca-key.pem -config root-ca/root-ca-config.json -profile intermediate kubernetes-ca/kubernetes-ca.csr | cfssljson -bare kubernetes-ca/kubernetes-ca
    cat << EOF > kubernetes-ca/kubernetes-ca-config.json
    {
        "signing": {
            "default": {
                "expiry": "168h"
            },
            "profiles": {
                "www": {
                    "expiry": "8760h",
                    "usages": [
                        "signing",
                        "key encipherment",
                        "server auth"
                    ]
                },
                "kubelet": {
                    "expiry": "8760h",
                    "usages": [
                        "signing",
                        "key encipherment",
                        "client auth",
                        "server auth"
                    ]
                },
                "client": {
                    "expiry": "8760h",
                    "usages": [
                        "signing",
                        "key encipherment",
                        "client auth"
                    ]
                }
            }
        }
    }
    EOF

    cat << EOF > kubernetes-front-proxy-ca/kubernetes-front-proxy-ca-csr.json
    {
        "CN": "kubernetes-front-proxy-ca",
        "key": {
            "algo": "rsa",
            "size": 4096
        },
        "ca": {
            "expiry": "26280h"
        }
    }
    EOF

    cfssl genkey -initca kubernetes-front-proxy-ca/kubernetes-front-proxy-ca-csr.json | cfssljson -bare kubernetes-front-proxy-ca/kubernetes-front-proxy-ca
    cfssl sign -ca root-ca/ca.pem -ca-key root-ca/ca-key.pem -config root-ca/root-ca-config.json -profile intermediate kubernetes-front-proxy-ca/kubernetes-front-proxy-ca.csr | cfssljson -bare kubernetes-front-proxy-ca/kubernetes-front-proxy-ca
    cfssl print-defaults config > kubernetes-front-proxy-ca/kubernetes-front-proxy-ca-config.json

    # Intermediate ETCD CA
    cat << EOF > etcd-ca/etcd-ca-config.json
    {
        "signing": {
            "profiles": {
                "server": {
                    "expiry": "8700h",
                    "usages": [
                        "signing",
                        "key encipherment",
                        "server auth",
                        "client auth"
                    ]
                },
                "client": {
                    "expiry": "8700h",
                    "usages": [
                        "signing",
                        "key encipherment",
                        "client auth"
                    ]
                },
                "peer": {
                    "expiry": "8700h",
                    "usages": [
                        "signing",
                        "key encipherment",
                        "server auth",
                        "client auth"
                    ]
                }
            }
        }
    }
    EOF

    cat << EOF > etcd-ca/etcd-ca-csr.json
    {
        "CN": "etcd-ca",
        "key": {
            "algo": "rsa",
            "size": 4096
        },
        "ca": {
            "expiry": "26280h"
        }
    }
    EOF

    cfssl genkey -initca etcd-ca/etcd-ca-csr.json | cfssljson -bare etcd-ca/etcd-ca
    cfssl sign -ca root-ca/ca.pem -ca-key root-ca/ca-key.pem -config root-ca/root-ca-config.json -profile intermediate etcd-ca/etcd-ca.csr | cfssljson -bare etcd-ca/etcd-ca

    # ETCD Instance certificates
    for instance in {1..3}; do
    cat << EOF > etcd${instance}-server-csr.json
    {
      "CN": "etcd${instance}",
      "hosts": [
        "etcd1",
        "etcd2",
        "etcd3",
        "192.168.168.2",
        "192.168.168.3",
        "192.168.168.4",
        "localhost",
        "127.0.0.1"
      ],
      "key": {
        "algo": "rsa",
        "size": 2048
      }
    }
    EOF

    cfssl gencert -ca=etcd-ca/etcd-ca.pem -ca-key=etcd-ca/etcd-ca-key.pem --config=etcd-ca/etcd-ca-config.json -profile=server etcd${instance}-server-csr.json | cfssljson -bare etcd${instance}
    done

    for instance in {1..3}; do
    cat << EOF > etcd${instance}-peer-csr.json
    {
      "CN": "etcd${instance}",
      "hosts": [
        "etcd1",
        "etcd2",
        "etcd3",
        "192.168.168.2",
        "192.168.168.3",
        "192.168.168.4",
        "localhost",
        "127.0.0.1"
      ],
      "key": {
        "algo": "rsa",
        "size": 2048
      }
    }
    EOF
    cfssl gencert -ca=etcd-ca/etcd-ca.pem -ca-key=etcd-ca/etcd-ca-key.pem --config=etcd-ca/etcd-ca-config.json -profile=peer etcd${instance}-peer-csr.json | cfssljson -bare etcd${instance}-peer
    done

    # ETCD Healthcheck Client certificate
    cat << EOF > etcd-healthcheck-client-csr.json
    {
      "CN": "kube-etcd-healthcheck-client",
      "key": {
        "algo": "rsa",
        "size": 2048
      },
      "names": [
          {
              "O": "system:masters"
          }
      ]
    }
    EOF
    cfssl gencert -ca=etcd-ca/etcd-ca.pem -ca-key=etcd-ca/etcd-ca-key.pem --config=etcd-ca/etcd-ca-config.json -profile=client etcd-healthcheck-client-csr.json | cfssljson -bare etcd-healthcheck-client

    # Kube API Server Kubelet Client Certificate
    cat << EOF > apiserver-kubelet-client-csr.json
    {
      "CN": "kube-apiserver-kubelet-client",
      "key": {
        "algo": "rsa",
        "size": 2048
      },
      "names": [
        {
          "O": "system:masters"
        }
      ]
    }
    EOF
    cfssl gencert -ca=kubernetes-ca/kubernetes-ca.pem -ca-key=kubernetes-ca/kubernetes-ca-key.pem --config=kubernetes-ca/kubernetes-ca-config.json -profile=client apiserver-kubelet-client-csr.json | cfssljson -bare apiserver-kubelet-client

    openssl genrsa -out sa.key 2048
    openssl rsa -in sa.key -pubout -out sa.pub

    # Kube Front Proxy Client Certificates
    # I do believe they could be skipped, though
    # Together with
    # --proxy-client-cert-file and --proxy-client-key-file
    # at the Kube API Server Service definition
    cat << EOF > front-proxy-client-csr.json
    {
      "CN": "front-proxy-client",
      "key": {
        "algo": "rsa",
        "size": 2048
      }
    }
    EOF
    cfssl gencert -ca=kubernetes-front-proxy-ca/kubernetes-front-proxy-ca.pem -ca-key=kubernetes-front-proxy-ca/kubernetes-front-proxy-ca-key.pem --config=kubernetes-front-proxy-ca/kubernetes-front-proxy-ca-config.json -profile=client front-proxy-client-csr.json | cfssljson -bare front-proxy-client

    # Kube API Server ETCD client Certificates
    cat << EOF > apiserver-etcd-client-csr.json
    {
      "CN": "kube-apiserver-etcd-client",
      "key": {
        "algo": "rsa",
        "size": 2048
      },
      "names": [
          {
              "O": "system:masters"
          }
      ]
    }
    EOF
    cfssl gencert -ca=etcd-ca/etcd-ca.pem -ca-key=etcd-ca/etcd-ca-key.pem --config=etcd-ca/etcd-ca-config.json -profile=client apiserver-etcd-client-csr.json | cfssljson -bare apiserver-etcd-client

    # Kube Apiserver Certificates
    cat << EOF > apiserver-csr.json
    {
      "CN": "kube-apiserver",
      "hosts": [
        "apiserver",
        "192.168.168.10",
        "10.96.0.1",
        "kubernetes",
        "kubernetes.default",
        "kubernetes.default.svc",
        "kubernetes.default.svc.cluster",
        "kubernetes.default.svc.cluster.local"
      ],
      "key": {
        "algo": "rsa",
        "size": 2048
      }
    }
    EOF
    cfssl gencert -ca=kubernetes-ca/kubernetes-ca.pem -ca-key=kubernetes-ca/kubernetes-ca-key.pem --config=kubernetes-ca/kubernetes-ca-config.json -profile=www apiserver-csr.json | cfssljson -bare apiserver

    # Kubernetes Cluster Admin
    cat << EOF > admin-csr.json
    {
      "CN": "kubernetes-admin",
      "key": {
        "algo": "rsa",
        "size": 2048
      },
      "names": [
        {
          "O": "system:masters"
        }
      ]
    }
    EOF

    cfssl gencert -ca=kubernetes-ca/kubernetes-ca.pem -ca-key=kubernetes-ca/kubernetes-ca-key.pem --config=kubernetes-ca/kubernetes-ca-config.json -profile=client admin-csr.json | cfssljson -bare admin
    touch admin.conf
    KUBECONFIG=admin.conf kubectl config set-cluster default-cluster --server=https://192.168.168.10:6443 --certificate-authority kubernetes-ca/kubernetes-ca.pem --embed-certs
    KUBECONFIG=admin.conf kubectl config set-credentials default-admin --client-key admin-key.pem --client-certificate admin.pem --embed-certs
    KUBECONFIG=admin.conf kubectl config set-context default-system --cluster default-cluster --user default-admin
    KUBECONFIG=admin.conf kubectl config use-context default-system


    # Kubernetes Controller Manager certificate
    cat << EOF > controller-manager-csr.json
    {
      "CN": "system:kube-controller-manager",
      "key": {
        "algo": "rsa",
        "size": 2048
      }
    }
    EOF

    touch controller-manager.conf
    cfssl gencert -ca=kubernetes-ca/kubernetes-ca.pem -ca-key=kubernetes-ca/kubernetes-ca-key.pem --config=kubernetes-ca/kubernetes-ca-config.json -profile=client controller-manager-csr.json | cfssljson -bare controller-manager
    KUBECONFIG=controller-manager.conf kubectl config set-cluster default-cluster --server=https://192.168.168.10:6443 --certificate-authority kubernetes-ca/kubernetes-ca.pem --embed-certs
    KUBECONFIG=controller-manager.conf kubectl config set-credentials default-controller-manager --client-key controller-manager-key.pem --client-certificate controller-manager.pem --embed-certs
    KUBECONFIG=controller-manager.conf kubectl config set-context default-system --cluster default-cluster --user default-controller-manager
    KUBECONFIG=controller-manager.conf kubectl config use-context default-system

    # Kubernetes Scheduler certificate
    cat << EOF > scheduler-csr.json
    {
      "CN": "system:kube-scheduler",
      "key": {
        "algo": "rsa",
        "size": 2048
      }
    }
    EOF

    touch scheduler.conf
    cfssl gencert -ca=kubernetes-ca/kubernetes-ca.pem -ca-key=kubernetes-ca/kubernetes-ca-key.pem --config=kubernetes-ca/kubernetes-ca-config.json -profile=client scheduler-csr.json | cfssljson -bare scheduler
    KUBECONFIG=scheduler.conf kubectl config set-cluster default-cluster --server=https://192.168.168.10:6443 --certificate-authority kubernetes-ca/kubernetes-ca.pem --embed-certs
    KUBECONFIG=scheduler.conf kubectl config set-credentials default-scheduler --client-key scheduler-key.pem --client-certificate scheduler.pem --embed-certs
    KUBECONFIG=scheduler.conf kubectl config set-context default-system --cluster default-cluster --user default-scheduler
    KUBECONFIG=scheduler.conf kubectl config use-context default-system

That should be it when it comes to certificates. If some workers should be tested, then just issue certificates for them similar to this:

    # To join worker nodes
    for instance in {1..3}; do
    cat << EOF > worker${instance}-csr.json
    {
      "CN": "system:node:worker${instance}",
      "key": {
        "algo": "rsa",
        "size": 2048
      },
      "hosts": [
        "worker${instance}",
        "192.168.168.2${instance}"
      ],
      "names": [
        {
          "O": "system:nodes"
        }
      ]
    }
    EOF

    cfssl gencert -ca=kubernetes-ca/kubernetes-ca.pem -ca-key=kubernetes-ca/kubernetes-ca-key.pem --config=kubernetes-ca/kubernetes-ca-config.json -profile=client -profile=kubelet worker${instance}-csr.json | cfssljson -bare worker${instance}
    touch worker${instance}.kubeconfig
    KUBECONFIG=worker${instance}.kubeconfig kubectl config set-cluster default-cluster --server=https://192.168.168.10:6443 --certificate-authority kubernetes-ca/kubernetes-ca.pem --embed-certs
    KUBECONFIG=worker${instance}.kubeconfig kubectl config set-credentials system:node:ubuntu --client-key worker${instance}-key.pem --client-certificate worker${instance}.pem --embed-certs
    KUBECONFIG=worker${instance}.kubeconfig kubectl config set-context default-system --cluster default-cluster --user system:node:ubuntu
    KUBECONFIG=worker${instance}.kubeconfig kubectl config use-context default-system
    done

## Preparation of jails (VNET) structure

Creation of jails are really out of scope here, but this is more or less how I did it. First some preparation of the ZFS dataset (and yes, I seem to break the hier(7) but on the other hand the docs state "There is no specific place to put the files for the jails."  --  my denoted place is /opt/local/jails on my dpool (the disk I intend to put for work a while). As root, run the following:

    zfs create -o mountpoint=/opt/local/jails dpool/jails
    zfs create dpool/jails/media
    zfs create dpool/jails/templates
    zfs create dpool/jails/containers

Then, with the jail structure in place:

- create a dataset to be the place holder for the 14.0-RELEASE of jail
- fetch the media
- unpack the media into the dataset
- copy the resolver and timezone information to the dataset
- update the dataset
- create a snapshot with the name base to form our template

As root, run the following:

    zfs create -p dpool/jails/templates/14.0-RELEASE
    fetch https://download.freebsd.org/ftp/releases/amd64/amd64/14.0-RELEASE/base.txz -o /opt/local/jails/media/14.0-RELEASE-base.txz
    tar -xf /opt/local/jails/media/14.0-RELEASE-base.txz -C /opt/local/jails/templates/14.0-RELEASE --unlink
    cp /etc/resolv.conf /opt/local/jails/templates/14.0-RELEASE/etc/resolv.conf
    cp /etc/localtime /opt/local/jails/templates/14.0-RELEASE/etc/localtime
    freebsd-update -b /opt/local/jails/templates/14.0-RELEASE/ fetch install
    zfs snapshot dpool/jails/templates/14.0-RELEASE@base

To enable the networking, I set up a bridge device and a dedicated subnet, here an excerpt of the relevant configuration of the VNET bridge

    # cat /etc/rc.conf:
    hostname="beast"
    cloned_interfaces="bridge32 bce1.32"
    if_bce_load="YES"
    ifconfig_bce1="up"
    ifconfig_bce1_32="up"
    ifconfig_bridge32="inet 192.168.168.1/24 addm bce1.32 up"
    jail_enable="YES"
    jail_parallel_start="YES"
    zfs_enable="YES"

## Creation of Kubernetes jails

To explain the happenings here:

- First we declare the range of ETCD nodes
- Then the range of Kubernetes Control Plane nodes
- The 14.0 snapshot is cloned to a VNET jail, which is created
- We create the ETCD structures, and copy the certificates
- Create a configuration for ETCD and then starts it, to form a cluster
- Iterate to the control plane nodes, repeat

As root, type following set of commands (or, if lazy, run the whole section below as a script).

    #!/usr/bin/env bash (if running this as a script)

    declare -A nodes
    nodes["etcd1"]="192.168.168.2"
    nodes["etcd2"]="192.168.168.3"
    nodes["etcd3"]="192.168.168.4"
    keys=("${!nodes[@]}")

    declare -A k8snodes
    k8snodes["apiserv"]="192.168.168.10"
    k8snodes["ctrlmgr"]="192.168.168.11"
    k8snodes["k8sched"]="192.168.168.12"
    k8skeys=("${!k8snodes[@]}")

    initial_cluster_token="etcd-cluster"
    bridge=bridge32

    for i in "${!nodes[@]}"; do

    zfs clone dpool/jails/templates/14.0-RELEASE@base dpool/jails/containers/${i}

    echo name: ${i}
    echo ip: ${nodes[${i}]}
    echo etcd-cluster: ${keys[0]}=https://${nodes[${keys[0]}]}:2380,${keys[1]}=https://${nodes[${keys[1]}]}:2380,${keys[2]}=https://${nodes[${keys[2]}]}:2380
    echo ip: ${nodes[${i}]}

    mkdir -p /opt/local/jails/containers/${i}/usr/local/{etc,bin,sbin}
    cp /var/tmp/etcd /opt/local/jails/containers/${i}/usr/local/sbin/
    cp /var/tmp/{etcdctl,etcdutl} /opt/local/jails/containers/${i}/usr/local/bin/
    (cd /var/tmp/k8sbsd/; gtar \
      --transform="s,etcd-ca/etcd-ca,ca,;s,-key.pem,.key,;s,pem,crt,;s,${i}-,,;s,${i},server," \
      -cf - ${i}{-peer,}{,-key}.pem etcd-ca/etcd-ca.pem)|(cd /opt/local/jails/containers/${i}/usr/local/etc;\
      tar -xf -)

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
      path = "/opt/local/jails/containers/\${name}";
      host.hostname = "\${name}";

      # VNET/VIMAGE
      vnet;
      vnet.interface = "\${epair}b";

      # NETWORKS/INTERFACES
      \$id = "${nodes[${i}]##*.}";
      \$ip = "192.168.168.\${id}/24";
      \$gateway = "192.168.168.254";
      \$bridge = "${bridge}";
      \$epair = "epair\${id}";

      # ADD TO bridge INTERFACE
      exec.prestart += "ifconfig \${epair} create up";
      exec.prestart += "ifconfig \${epair}a up descr jail:\${name}";
      exec.prestart += "ifconfig \${bridge} addm \${epair}a up";
      exec.start    += "ifconfig \${epair}b \${ip} up";
      exec.start    += "route add default \${gateway}";
      exec.poststop = "ifconfig \${bridge} deletem \${epair}a";
      exec.poststop += "ifconfig \${epair}a destroy";
    }
    EOF

    cat << EOF >  /opt/local/jails/containers/${i}/usr/local/etc/etcd.conf
    # This is the configuration file for the etcd server.

    # Human-readable name for this member.
    name: '${i}'

    # Path to the data directory.
    data-dir: /var/etcd/

    # Number of committed transactions to trigger a snapshot to disk.
    snapshot-count: 10000

    # Time (in milliseconds) of a heartbeat interval.
    heartbeat-interval: 100

    # Time (in milliseconds) for an election to timeout.
    election-timeout: 1000

    # Raise alarms when backend size exceeds the given quota. 0 means use the
    # default quota.
    quota-backend-bytes: 0

    # List of comma separated URLs to listen on for peer traffic.
    listen-peer-urls: https://${nodes[${i}]}:2380

    # List of comma separated URLs to listen on for client traffic.
    listen-client-urls: https://${nodes[${i}]}:2379

    # Maximum number of snapshot files to retain (0 is unlimited).
    max-snapshots: 5

    # Maximum number of wal files to retain (0 is unlimited).
    max-wals: 5

    # Comma-separated white list of origins for CORS (cross-origin resource sharing).
    cors:

    # List of this member's peer URLs to advertise to the rest of the cluster.
    # The URLs needed to be a comma-separated list.
    initial-advertise-peer-urls: https://${nodes[${i}]}:2380

    # List of this member's client URLs to advertise to the public.
    # The URLs needed to be a comma-separated list.
    advertise-client-urls: https://${nodes[${i}]}:2379

    # Discovery URL used to bootstrap the cluster.
    discovery:

    # Valid values include 'exit', 'proxy'
    discovery-fallback: 'exit'

    # HTTP proxy to use for traffic to discovery service.
    discovery-proxy:

    # DNS domain used to bootstrap initial cluster.
    discovery-srv:

    # Comma separated string of initial cluster configuration for bootstrapping.
    initial-cluster: "${keys[0]}=https://${nodes[${keys[0]}]}:2380,${keys[1]}=https://${nodes[${keys[1]}]}:2380,${keys[2]}=https://${nodes[${keys[2]}]}:2380"

    # Initial cluster token for the etcd cluster during bootstrap.
    initial-cluster-token: '${initial_cluster_token}'

    # Initial cluster state ('new' or 'existing').
    initial-cluster-state: 'new'

    # Reject reconfiguration requests that would cause quorum loss.
    strict-reconfig-check: false

    # Enable runtime profiling data via HTTP server
    enable-pprof: false

    # Valid values include 'on', 'readonly', 'off'
    proxy: 'off'

    # Time (in milliseconds) an endpoint will be held in a failed state.
    proxy-failure-wait: 5000

    # Time (in milliseconds) of the endpoints refresh interval.
    proxy-refresh-interval: 30000

    # Time (in milliseconds) for a dial to timeout.
    proxy-dial-timeout: 1000

    # Time (in milliseconds) for a write to timeout.
    proxy-write-timeout: 5000

    # Time (in milliseconds) for a read to timeout.
    proxy-read-timeout: 0

    client-transport-security:
      # Path to the client server TLS cert file.
      cert-file: /usr/local/etc/server.crt

      # Path to the client server TLS key file.
      key-file: /usr/local/etc/server.key

      # Enable client cert authentication.
      client-cert-auth: true

      # Path to the client server TLS trusted CA cert file.
      trusted-ca-file: /usr/local/etc/ca.crt

      # Client TLS using generated certificates
      auto-tls: false

    peer-transport-security:
      # Path to the peer server TLS cert file.
      cert-file: /usr/local/etc/peer.crt

      # Path to the peer server TLS key file.
      key-file: /usr/local/etc/peer.key

      # Enable peer client cert authentication.
      client-cert-auth: true

      # Path to the peer server TLS trusted CA cert file.
      trusted-ca-file: /usr/local/etc/ca.crt

      # Peer TLS using generated certificates.
      auto-tls: false

    # Enable debug-level logging for etcd.
    log-level: info

    logger: zap

    # Specify 'stdout' or 'stderr' to skip journald logging even when running under systemd.
    log-outputs: [stdout]

    # Force to create a new one member cluster.
    force-new-cluster: false

    auto-compaction-mode: periodic
    auto-compaction-retention: "1"

    # Limit etcd to a specific set of tls cipher suites
    cipher-suites: [
      TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,
      TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
    ]

    # Limit etcd to specific TLS protocol versions
    tls-min-version: 'TLS1.2'
    tls-max-version: 'TLS1.3'
    EOF

    echo "etcd_enable=\"YES\"" > /opt/local/jails/containers/${i}/etc/rc.conf

    cat << EOF > /opt/local/jails/containers/${i}/etc/rc.d/etcd
    #!/bin/sh
    #
    #

    # PROVIDE: etcd
    # REQUIRE: LOGIN FILESYSTEMS
    # KEYWORD: shutdown

    . /etc/rc.subr

    name="etcd"

    desc="ETCD Demon"
    rcvar="etcd_enable"
    etcd_flags="--config-file /usr/local/etc/etcd.conf"
    command="/usr/local/sbin/\${name}"
    command_args="> /var/log/etcd.log 2>&1 &";
    procname="/usr/local/sbin/etcd"

    load_rc_config \$name
    run_rc_command "\$1"
    EOF
    chmod 0555 /opt/local/jails/containers/${i}/etc/rc.d/etcd

    service jail start ${i}
    done

    jexec -u root etcd1 etcdctl --cacert /usr/local/etc/ca.crt --cert /usr/local/etc/server.crt --key /usr/local/etc/server.key --endpoints ${nodes[${keys[0]}]}:2379,${nodes[${keys[1]}]}:2379,${nodes[${keys[2]}]}:2379 endpoint status -w table

    for i in "${!k8snodes[@]}"; do

    zfs clone dpool/jails/templates/14.0-RELEASE@base dpool/jails/containers/${i}

    echo name: ${i}
    echo ip: ${k8snodes[${i}]}

    mkdir -p /opt/local/jails/containers/${i}/usr/local/{etc,sbin}

    if [ "${i}" == "apiserv" ]; then
        echo "now"
        cp /var/tmp/kube-apiserver /opt/local/jails/containers/${i}/usr/local/sbin/
        chmod 0555 /opt/local/jails/containers/${i}/usr/local/sbin/kube-apiserver

        (cd /var/tmp/k8sbsd/; gtar \
          --transform="s,kubernetes-ca/kubernetes-ca,ca,;s,etcd-ca/etcd-ca,etcd-ca,;s,kubernetes-front-proxy-ca/kubernetes-,,;s,-key.pem,.key,;s,pem,crt," \
          -cf - etcd-ca/etcd-ca.pem apiserver-etcd-client.pem apiserver-etcd-client-key.pem apiserver-kubelet-client.pem apiserver-kubelet-client-key.pem \
          apiserver.pem apiserver-key.pem front-proxy-client-key.pem front-proxy-client.pem kubernetes-front-proxy-ca/kubernetes-front-proxy-ca.pem \
          sa.pub sa.key kubernetes-ca/kubernetes-ca.pem)|(cd /opt/local/jails/containers/${i}/usr/local/etc;\
          tar -xf -)

        ENCRYPTION_KEY=$(head -c 32 /dev/urandom | base64)
        cat > /opt/local/jails/containers/${i}/usr/local/etc/encryption-config.yaml <<EOF
        kind: EncryptionConfig
        apiVersion: v1
        resources:
          - resources:
              - secrets
            providers:
              - aescbc:
                  keys:
                    - name: key1
                      secret: ${ENCRYPTION_KEY}
              - identity: {}
    EOF

        cat << EOF > /opt/local/jails/containers/${i}/etc/rc.d/apiserver
        #!/bin/sh
        #
        #

        # PROVIDE: etcd
        # REQUIRE: LOGIN FILESYSTEMS
        # KEYWORD: shutdown

        . /etc/rc.subr

        name="apiserver"

        desc="Kubernetes API Server"
        rcvar="apiserver_enable"
        apiserver_flags="--advertise-address=${k8snodes[${i}]} --allow-privileged=true --audit-log-maxage=30 \
            --audit-log-maxbackup=3 --audit-log-maxsize=100 --audit-log-path=/var/log/audit.log \
            --authorization-mode=Node,RBAC --bind-address=0.0.0.0 --client-ca-file=/usr/local/etc/ca.crt \
            --enable-admission-plugins=NodeRestriction --enable-bootstrap-token-auth=true \
            --etcd-cafile=/usr/local/etc/etcd-ca.crt --etcd-certfile=/usr/local/etc/apiserver-etcd-client.crt \
            --etcd-keyfile=/usr/local/etc/apiserver-etcd-client.key \
            --etcd-servers=https://${nodes[${keys[0]}]}:2379,https://${nodes[${keys[1]}]}:2379,https://${nodes[${keys[2]}]}:2379 \
            --event-ttl=1h --encryption-provider-config=/usr/local/etc/encryption-config.yaml \
            --kubelet-preferred-address-types=Hostname,InternalIP,ExternalIP \
            --kubelet-certificate-authority=/usr/local/etc/ca.crt \
            --kubelet-client-certificate=/usr/local/etc/apiserver-kubelet-client.crt \
            --kubelet-client-key=/usr/local/etc/apiserver-kubelet-client.key \
            --proxy-client-cert-file=/usr/local/etc/front-proxy-client.crt \
            --proxy-client-key-file=/usr/local/etc/front-proxy-client.key \
            --requestheader-allowed-names=front-proxy-client \
            --requestheader-client-ca-file=/usr/local/etc/front-proxy-ca.crt \
            --requestheader-extra-headers-prefix=X-Remote-Extra- --requestheader-group-headers=X-Remote-Group \
            --requestheader-username-headers=X-Remote-User  --secure-port=6443 \
            --service-account-key-file=/usr/local/etc/sa.pub --service-account-signing-key-file=/usr/local/etc/sa.key \
            --service-account-issuer=https://kubernetes.default.svc.cluster.local:6443 \
            --service-cluster-ip-range=10.96.0.0/12 --service-node-port-range=30000-32767 \
            --tls-cert-file=/usr/local/etc/apiserver.crt --tls-private-key-file=/usr/local/etc/apiserver.key --v=0"
        command="/usr/local/sbin/kube-apiserver"
        command_args="> /var/log/apiserver.log 2>&1 &";
        procname="/usr/local/sbin/kube-apiserver"

        load_rc_config \$name
        run_rc_command "\$1"
    EOF

        chmod 0555 /opt/local/jails/containers/${i}/etc/rc.d/apiserver

        echo "apiserver_enable=\"YES\"" > /opt/local/jails/containers/${i}/etc/rc.conf

    elif [ "${i}" == "ctrlmgr" ]; then
        echo "now"
        cp /var/tmp/kube-controller-manager /opt/local/jails/containers/${i}/usr/local/sbin/
        chmod 0555 /opt/local/jails/containers/${i}/usr/local/sbin/kube-controller-manager

        (cd /var/tmp/k8sbsd/; gtar \
          --transform="s,kubernetes-ca/kubernetes-ca,ca,;s,-key.pem,.key,;s,pem,crt," -cf - sa.key \
          kubernetes-ca/kubernetes-ca*.pem controller-manager.conf)|(cd /opt/local/jails/containers/${i}/usr/local/etc;\
          tar -xf -)

        cat << EOF > /opt/local/jails/containers/${i}/etc/rc.d/ctrlmgr
        #!/bin/sh
        #
        #

        # PROVIDE: kube-controller-manager
        # REQUIRE: LOGIN FILESYSTEMS
        # KEYWORD: shutdown

        . /etc/rc.subr

        name="ctrlmgr"

        desc="Kubernetes Controller Manager"
        rcvar="ctrlmgr_enable"
        ctrlmgr_flags="--bind-address=0.0.0.0  --cluster-name=cluster  \
            --cluster-signing-cert-file=/usr/local/etc/ca.crt  \
            --cluster-signing-key-file=/usr/local/etc/ca.key  \
            --kubeconfig=/usr/local/etc/controller-manager.conf  \
            --leader-elect=true  --root-ca-file=/usr/local/etc/ca.crt  \
            --service-account-private-key-file=/usr/local/etc/sa.key \
            --service-cluster-ip-range=10.96.0.0/12  \
            --use-service-account-credentials=true --v=2"
        command="/usr/local/sbin/kube-controller-manager"
        command_args="> /var/log/kube-controller-manager.log 2>&1 &";
        procname="/usr/local/sbin/kube-controller-manager"

        load_rc_config \$name
        run_rc_command "\$1"
    EOF

        chmod 0555 /opt/local/jails/containers/${i}/etc/rc.d/ctrlmgr

        echo "ctrlmgr_enable=\"YES\"" > /opt/local/jails/containers/${i}/etc/rc.conf

    elif [ "${i}" == "k8sched" ]; then
        echo "now"
        cp /var/tmp/kube-scheduler /opt/local/jails/containers/${i}/usr/local/sbin/
        chmod 0555 /opt/local/jails/containers/${i}/usr/local/sbin/kube-scheduler

        (cd /var/tmp/k8sbsd/; gtar -cf - \
          scheduler.conf)|(cd /opt/local/jails/containers/${i}/usr/local/etc; tar -xf -)

        cat > /opt/local/jails/containers/${i}/usr/local/etc/kube-scheduler.yaml <<EOF
        apiVersion: kubescheduler.config.k8s.io/v1beta2
        kind: KubeSchedulerConfiguration
        clientConnection:
          kubeconfig: "/usr/local/etc/scheduler.conf"
        leaderElection:
          leaderElect: true
    EOF

        cat << EOF > /opt/local/jails/containers/${i}/etc/rc.d/k8sched
        #!/bin/sh
        #
        #

        # PROVIDE: kube-scheduler
        # REQUIRE: LOGIN FILESYSTEMS
        # KEYWORD: shutdown

        . /etc/rc.subr

        name="k8sched"

        desc="Kubernetes Scheduler"
        rcvar="sched_enable"
        sched_flags="--config=/usr/local/etc/kube-scheduler.yaml --v=2"
        command="/usr/local/sbin/kube-scheduler"
        command_args="> /var/log/kube-scheduler.log 2>&1 &";
        procname="/usr/local/sbin/kube-scheduler"

        load_rc_config \$name
        run_rc_command "\$1"
    EOF

        chmod 0555 /opt/local/jails/containers/${i}/etc/rc.d/k8sched

        echo "k8sched_enable=\"YES\"" > /opt/local/jails/containers/${i}/etc/rc.conf
    fi

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
      path = "/opt/local/jails/containers/\${name}";
      host.hostname = "\${name}";

      # VNET/VIMAGE
      vnet;
      vnet.interface = "\${epair}b";

      # NETWORKS/INTERFACES
      \$id = "${k8snodes[${i}]##*.}";
      \$ip = "192.168.168.\${id}/24";
      \$gateway = "192.168.168.254";
      \$bridge = "${bridge}";
      \$epair = "epair\${id}";

      # ADD TO bridge INTERFACE
      exec.prestart += "ifconfig \${epair} create up";
      exec.prestart += "ifconfig \${epair}a up descr jail:\${name}";
      exec.prestart += "ifconfig \${bridge} addm \${epair}a up";
      exec.start    += "ifconfig \${epair}b \${ip} up";
      exec.start    += "route add default \${gateway}";
      exec.poststop = "ifconfig \${bridge} deletem \${epair}a";
      exec.poststop += "ifconfig \${epair}a destroy";
    }
    EOF

    service jail start ${i}

    done

Voila!

## Let's break it down

**ETCD**

The output will be similar to this:

    name: etcd1
    ip: 192.168.168.2
    etcd-cluster: etcd1=https://192.168.168.2:2380,etcd3=https://192.168.168.4:2380,etcd2=https://192.168.168.3:2380
    ip: 192.168.168.2
    Starting jails: etcd1.
    name: etcd3
    ip: 192.168.168.4
    etcd-cluster: etcd1=https://192.168.168.2:2380,etcd3=https://192.168.168.4:2380,etcd2=https://192.168.168.3:2380
    ip: 192.168.168.4
    Starting jails: etcd3.
    name: etcd2
    ip: 192.168.168.3
    etcd-cluster: etcd1=https://192.168.168.2:2380,etcd3=https://192.168.168.4:2380,etcd2=https://192.168.168.3:2380
    ip: 192.168.168.3
    Starting jails: etcd2.
    +--------------------+------------------+---------+---------+-----------+------------+-----------+------------+--------------------+--------+
    |      ENDPOINT      |        ID        | VERSION | DB SIZE | IS LEADER | IS LEARNER | RAFT TERM | RAFT INDEX | RAFT APPLIED INDEX | ERRORS |
    +--------------------+------------------+---------+---------+-----------+------------+-----------+------------+--------------------+--------+
    | 192.168.168.2:2379 | 4933c694e00191e0 |  3.5.10 |   25 kB |     false |      false |         2 |          8 |                  8 |        |
    | 192.168.168.4:2379 | 73bf67d46d6f6f48 |  3.5.10 |   25 kB |      true |      false |         2 |          8 |                  8 |        |
    | 192.168.168.3:2379 | 9ef38d7e84813319 |  3.5.10 |   25 kB |     false |      false |         2 |          8 |                  8 |        |
    +--------------------+------------------+---------+---------+-----------+------------+-----------+------------+--------------------+--------+

**Kubernetes Control Plane nodes**

The output will be similar to this:

    name: ctrlmgr
    ip: 192.168.168.11
    now
    Starting jails: ctrlmgr.
    name: k8sched
    ip: 192.168.168.12
    now
    Starting jails: k8sched.
    name: apiserv
    ip: 192.168.168.10
    now
    Starting jails: apiserv.

Then, in the /var/tmp/k8sbsd

    cd /var/tmp/k8sbsd
    export KUBECONFIG=admin.conf
    chmod +x /var/tmp/kubectl
    kubectl cluster-info

You can now interact with the API (but as there are no worker nodes deployed, only Control Plane related operations will happen).

    # kubectl cluster-info
    Kubernetes control plane is running at https://192.168.168.10:6443

    To further debug and diagnose cluster problems, use 'kubectl cluster-info dump'.

    #kubectl create secret generic this-is-secret --from-literal=username=charlie --from-literal=password=nicetry
    secret/this-is-secret created

    # kubectl get secrets this-is-secret -o jsonpath='{.data}'
    {"password":"bmljZXRyeQ==","username":"Y2hhcmxpZQ=="}

    # kubectl version -o yaml
    kubectl version
    Client Version: v1.29.0-1+d15af86e9e661f
    Kustomize Version: v5.0.4-0.20230601165947-6ce0bf390ce3
    Server Version: v1.29.0-1+d15af86e9e661f

What next? To be usable at least some Data Plane needs to be provisioned. An external node, a bhyve guest, a jail with runj.. but that's for another article, this was just about the Control Plane.

A YouTube video is in the plan for coming days.
