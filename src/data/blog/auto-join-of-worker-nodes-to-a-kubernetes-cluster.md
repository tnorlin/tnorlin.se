---
title: Auto join of worker nodes to a Kubernetes cluster
author: Tony Norlin
description: Steps taken to enable worker nodes to automatically join a kubernetes cluster.
featured: true
pubDatetime: 2024-09-23T10:55:15.922Z
draft: false
tags:
  - kubernetes
  - networking
  - cfssl
  - illumos
keywords:
  - bgp
  - cilium
  - illumos
  - kubernetes
  - networking
---

![An illustration of data centre](/assets/datacentre.png)

---

### Backstory  -  the current state of home lab cluster

A little update for those who have followed my adventures of bringing a fully featured kubernetes cluster to life (running the control plane externally in illumos), at last it's possible to have a fully conformant cluster.

The v1.16 release of Cilium finally brought an integrated possibility to announce ClusterIP through BGP, which means that an external control plane can connect to webhooks provided by dynamic admission controllers (which happens to run with at the data plane, as an extension to the control plane).

The next release of Cilium, v1.17, will bring a long awaited feature - a kube-proxy free cluster that passed (#9207 was recently closed and merged into the master branch) the CNCF conformance test for certified Kubernetes. This is great news as it allows for building a 100% conformant cluster with the Cilium sidecarless service mesh!

---

I went ahead and u̶p̶g̶r̶a̶d̶e̶d̶ (well, I sacrified current IPAM reservations and uninstalled/installed) Cilium to 1.17.0-pre.0 with the following helm values declared:

```
# Declare the Apiserver IP and Port

K8S_API_SERVER=
K8S_API_PORT=
```

Helm values override:

```
cat << EOF > cilium-helm-values.yaml
USER-SUPPLIED VALUES:
bgpControlPlane:
enabled: true
bpf:
lbExternalClusterIP: true
cluster:
name: default-cluster
cluster.name: default-cluster
gatewayAPI:
enabled: true
hubble:
enabled: true
metrics:
dashboards:
annotations:
grafana_folder: Cilium
enabled: true
namespace: monitoring
enableOpenMetrics: true
enabled: - dns - drop - tcp - icmp - flow:sourceContext=workload-name|reserved-identity;destinationContext=workload-name|reserved-identity - kafka:labelsContext=source_namespace,source_workload,destination_namespace,destination_workload,traffic_direction;sourceContext=workload-name|reserved-identity;destinationContext=workload-name|reserved-identity - httpV2:exemplars=true;labelsContext=source_ip,source_namespace,source_workload,destination_ip,destination_namespace,destination_workload,traffic_direction;sourceContext=workload-name|reserved-identity;destinationContext=workload-name|reserved-identity
serviceMonitor:
enabled: true
operator:
prometheus:
enabled: true
serviceMonitor:
enabled: true
prometheus:
enabled: true
serviceMonitor:
enabled: true
relay:
enabled: true
prometheus:
enabled: true
serviceMonitor:
enabled: true
ui:
enabled: true
ingressController:
default: true
enabled: true
loadbalancerMode: dedicated
ipam:
mode: cluster-pool
k8sServiceHost: ${K8S_API_SERVER}
k8sServicePort: ${K8S_API_PORT}
kubeProxyReplacement: true
operator:
replicas: 1
rollOutCiliumPods: true
EOF
```

At the same time, it was a great moment for me to upgrade to the Cilium BGP Control Plane v2 (https://docs.cilium.io/en/latest/network/bgp-control-plane/bgp-control-plane-v2/).

The Custom Resource Definitions for BGP Control Plane v2 differs a bit in it's structure, but not that much in the basic form. The components have been split up into a `CiliumBGPClusterConfig`, `CiliumBGPPeerConfig` and `CiliumBGPAdvertisement`. One detail to advise, what I haven't reflected just by reading, is that the `CiliumLoadBalancerIPPool` have changed its structure from `.spec.cidr` into `.spec.blocks` (as to allow for more flexibility).

So the following files needs to be created in order to utilize the v2:

```
# Declare the CIDR that should be announced over BGP
LB_CIDR=
# Cluster ASN
CLUSTER_ASN=
# The Peer (router) ASN and IP
PEER_ASN=
PEER_IP=
```

Create a IP-Pool configuration:

```
cat << EOF > cilium-ippool.yaml
apiVersion: cilium.io/v2alpha1
kind: CiliumLoadBalancerIPPool
metadata:
  name: ippool
spec:
  blocks:
  - cidr: ${LB_CIDR}
  disabled: false
EOF
```

And for the BGP, a configuration similar to below would be set:

```
cat << EOF > cilium-bgp-v2.yaml
---
apiVersion: cilium.io/v2alpha1
kind: CiliumBGPClusterConfig
metadata:
  name: cilium-bgp
spec:
  nodeSelector:
    matchLabels:
      bgp: worker
  bgpInstances:
  - name: "instance_asn"
    localASN: ${CLUSTER_ASN}
    peers:
    - name: "peer_asn"
      peerASN: ${PEER_ASN}
      peerAddress: ${PEER_IP}
      peerConfigRef:
        name: "cilium-peer"
---
apiVersion: cilium.io/v2alpha1
kind: CiliumBGPPeerConfig
metadata:
  name: cilium-peer
spec:
  transport:
    peerPort: 179
  families:
    - afi: ipv4
      safi: unicast
      advertisements:
        matchLabels:
          advertise: "bgp"
---
apiVersion: cilium.io/v2alpha1
kind: CiliumBGPAdvertisement
metadata:
  name: bgp-advertisements
  labels:
    advertise: bgp
spec:
  advertisements:
    - advertisementType: "PodCIDR"
      attributes:
        communities:
          standard: [ "65000:99" ]
    - advertisementType: "Service"
      service:
        addresses:
          - ClusterIP
          - ExternalIP
          - LoadBalancerIP
      selector:             # <-- select all services
        matchExpressions:
         - {key: somekey, operator: NotIn, values: ['never-used-value']}
EOF
```

---

This is, by the way, the result of the conformance test, as ran in my kubernetes cluster with control plane running on illumos and worker nodes in Linux. Pretty neat, huh?

```
Ran 402 of 7197 Specs in 6431.740 seconds
SUCCESS! -- 402 Passed | 0 Failed | 0 Pending | 6795 Skipped
PASS

Ginkgo ran 1 suite in 1h47m15.051532529s
Test Suite Passed
```

## The Certificate Authority

As I've already written quite a bit about the procedure of configuring the CA in previous posts, I will not repeat those steps again. Instead, I will describe the necessary steps to have the CFSSL Api up and running.

While the steps below will be described for illumos, similar steps would be taken for a Linux (or BSD) system, just with a different service manifest.

It's possible to use various implementations (as described here https://kubernetes.io/docs/tasks/administer-cluster/certificates/ ) to get a Certificate Authority up and running, but we will focus on the one chosen by kubeadm (as it has support for API with the `-serve` flag).

The API needs a backend, and either go for the goose (
https://github.com/cloudflare/cfssl/tree/master/certdb), or use the same inspiration as I did from this excellent blog post  -  https://bouchaud.org/blog/en/posts/initializing-root-intermediate-ca-with-cfssl/).

The following steps will modify a couple of the earlier configuration made to the CA.

At first, declare some important variables:

```
# Create a Key which will be used to authenticate with the CA
AUTH_KEY=$(openssl rand -hex 16)
# The IP on the host running CFSSL API
CA_URL=
```

- Create a sqlite backend:

```
cat << EOF > sqlite.sql
CREATE TABLE certificates (
  serial_number            blob NOT NULL,
  authority_key_identifier blob NOT NULL,
  ca_label                 blob,
  status                   blob NOT NULL,
  reason                   int,
  expiry                   timestamp,
  revoked_at               timestamp,
  issued_at                timestamp,
  not_before               timestamp,
  metadata                 blob,
  sans                     blob,
  common_name              blob,
  pem                      blob NOT NULL,
  PRIMARY KEY(serial_number, authority_key_identifier)
);

CREATE TABLE ocsp_responses (
  serial_number            blob NOT NULL,
  authority_key_identifier blob NOT NULL,
  body                     blob NOT NULL,
  expiry                   timestamp,
  PRIMARY KEY(serial_number, authority_key_identifier),
  FOREIGN KEY(serial_number, authority_key_identifier) REFERENCES certificates(serial_number, authority_key_identifier)
);
EOF
cat sqlite.sql | sqlite3 /opt/ooce/etc/certdb.db
```

- Create a configuration file to enable the database access

```
cat << EOF > /opt/ooce/etc/sqlite_db.json
{"driver":"sqlite3","data_source":"/opt/ooce/etc/certdb.db"}
EOF

cat << EOF > ocsp-csr.json
{
  "CN": "OCSP signer",
  "key": {
    "algo": "rsa",
    "size": 4096
  },
  "names": [
    {
      "C": "SE",
      "ST": ".",
      "L": "Stockholm"
    }
  ]
}
EOF
```

- Create/modify the intermediate Kubernetes CA, so that there is a URL set for the OCSP and the CRL.

```
cat << EOF > kubernetes-ca/kubernetes-ca-config.json
{
    "signing": {
        "default": {
            "auth_key": "key1",
            "ocsp_url": "http://${CA_URL}:8889",
            "crl_url": "http://${CA_URL}:8888/crl",
            "expiry": "168h"
        },
        "profiles": {
            "intermediate": {
              "auth_key": "key1",
              "expiry": "43800h",
              "usages": [
                "signing",
                "key encipherment",
                "cert sign",
                "crl sign"
              ],
              "ca_constraint": {
                "is_ca": true,
                "max_path_len": 1
              }
            },
            "ocsp": {
              "auth_key": "key1",
              "usages": [
                "digital signature",
                "ocsp signing"
              ],
              "expiry": "26280h"
            },
            "www": {
                "auth_key": "key1",
                "expiry": "8760h",
                "usages": [
                    "signing",
                    "key encipherment",
                    "server auth"
                ]
            },
            "kubelet": {
                "expiry": "8760h",
                "auth_key": "key1",
                "usages": [
                    "signing",
                    "key encipherment",
                    "client auth",
                    "server auth"
                ]
            },
            "client": {
                "auth_key": "key1",
                "expiry": "8760h",
                "usages": [
                    "signing",
                    "key encipherment",
                    "client auth"
                ]
            }
        }
    },
  "auth_keys": {
    "key1": {
      "key": "${AUTH_KEY}",
      "type": "standard"
    }
  }
}
EOF
cfssl gencert -ca=kubernetes-ca/kubernetes-ca.pem -ca-key=kubernetes-ca/kubernetes-ca-key.pem -config=kubernetes-ca/kubernetes-ca-config.json -profile="ocsp" ocsp-csr.json |cfssljson -bare ocsp
```

- Move the files in place for the API:

```
cp kubernetes-ca/kubernetes-ca{{,-key}.pem,-config.json} ocsp{,-key}.pem /opt/ooce/etc/
```

- Create a SMF method script (for systemd, it would make sense to pick the executable arguments after `exec`):

```
cat << EOF > /lib/svc/method/cfssl
#
# The contents of this file are subject to the terms of the
# Common Development and Distribution License (the "License").
# You may not use this file except in compliance with the License.
#
# You can obtain a copy of the license at usr/src/OPENSOLARIS.LICENSE
# or http://www.opensolaris.org/os/licensing.
# See the License for the specific language governing permissions
# and limitations under the License.
#
# When distributing Covered Code, include this CDDL HEADER in each
# file and include the License file at usr/src/OPENSOLARIS.LICENSE.
# If applicable, add the following below this CDDL HEADER, with the
# fields enclosed by brackets "[]" replaced with your own identifying
# information: Portions Copyright [yyyy] [name of copyright owner]
#
# CDDL HEADER END
#
#
# Copyright 2008 Sun Microsystems, Inc.  All rights reserved.
# Use is subject to license terms.
#
#ident    "%Z%%M%    %I%    %E% SMI"

#
# Start/Stop client LDAP service
#

. /lib/svc/share/smf_include.sh

case "\$1" in
'start')
        exec /opt/ooce/bin/cfssl serve -address=0.0.0.0 -port=8888 \
        -db-config=/opt/ooce/etc/sqlite_db.json \
        -ca=/opt/ooce/etc/kubernetes-ca.pem -ca-key=/opt/ooce/etc/kubernetes-ca-key.pem \
        -config=/opt/ooce/etc/kubernetes-ca-config.json \
        -responder=/opt/ooce/etc/ocsp.pem \
        -responder-key=/opt/ooce/etc/ocsp-key.pem  > /var/log/cfssl.log \
        2>&1 &
    ;;

'stop')
    exec /usr/bin/pkill cfssl
    ;;

*)
    echo "Usage: \$0 { start | stop }"
    exit 1
    ;;
esac
EOF
chmod +x /lib/svc/method/cfssl
```

- Service Manifest File:

```
cat << EOF > /lib/svc/method/cfssl
#
# The contents of this file are subject to the terms of the
# Common Development and Distribution License (the "License").
# You may not use this file except in compliance with the License.
#
# You can obtain a copy of the license at usr/src/OPENSOLARIS.LICENSE
# or http://www.opensolaris.org/os/licensing.
# See the License for the specific language governing permissions
# and limitations under the License.
#
# When distributing Covered Code, include this CDDL HEADER in each
# file and include the License file at usr/src/OPENSOLARIS.LICENSE.
# If applicable, add the following below this CDDL HEADER, with the
# fields enclosed by brackets "[]" replaced with your own identifying
# information: Portions Copyright [yyyy] [name of copyright owner]
#
# CDDL HEADER END
#
#
# Copyright 2008 Sun Microsystems, Inc.  All rights reserved.
# Use is subject to license terms.
#
#ident    "%Z%%M%    %I%    %E% SMI"

#
# Start/Stop client LDAP service
#

. /lib/svc/share/smf_include.sh

case "\$1" in
'start')
        exec /opt/ooce/bin/cfssl serve -address=0.0.0.0 -port=8888 \
        -db-config=/opt/ooce/etc/sqlite_db.json \
        -ca=/opt/ooce/etc/kubernetes-ca.pem -ca-key=/opt/ooce/etc/kubernetes-ca-key.pem \
        -config=/opt/ooce/etc/kubernetes-ca-config.json \
        -responder=/opt/ooce/etc/ocsp.pem \
        -responder-key=/opt/ooce/etc/ocsp-key.pem  > /var/log/cfssl.log \
        2>&1 &
    ;;

'stop')
    exec /usr/bin/pkill cfssl
    ;;

*)
    echo "Usage: \$0 { start | stop }"
    exit 1
    ;
esac
EOF
chmod +x /lib/svc/method/cfssl
```

## Worker Node Cloud Init

As I've described the setup of worker nodes in earlier posts, I'll keep it brief and just describe the steps within the `runcmd`: stanza. Commented out serves as an example for a virtualized guest (I create a template and clones it to save time, thus not necessary to install the client binaries, again):

```
runcmd:
  - modprobe overlay
  - modprobe br_netfilter
  - sysctl --system 2>/dev/null
  #- echo "deb [signed-by=/usr/share/keyrings/libcontainers-archive-keyring.gpg] https://download.opensuse.org/repositories/devel:/kubic:/libcontainers:/stable/xUbuntu_22.04/ /" > /etc/apt/sources.list.d/devel:kubic:libcontainers:stable.list
  #- echo "deb [signed-by=/usr/share/keyrings/libcontainers-crio-archive-keyring.gpg] https://download.opensuse.org/repositories/devel:/kubic:/libcontainers:/stable:/cri-o:/1.28/xUbuntu_22.04/ /" > /etc/apt/sources.list.d/devel:kubic:libcontainers:stable:cri-o:1.28.list
  #- mkdir -p /usr/share/keyrings /var/lib/kubelet
  #- curl -L https://download.opensuse.org/repositories/devel:/kubic:/libcontainers:/stable/xUbuntu_22.04/Release.key | gpg --dearmor -o /usr/share/keyrings/libcontainers-archive-keyring.gpg
  #- curl -L https://download.opensuse.org/repositories/devel:/kubic:/libcontainers:/stable:/cri-o:/1.28/xUbuntu_22.04/Release.key | gpg --dearmor -o /usr/share/keyrings/libcontainers-crio-archive-keyring.gpg
  #- curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.28/deb/Release.key | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
  #- echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.28/deb/ /' | sudo tee /etc/apt/sources.list.d/kubernetes.list
  #- export DEBIAN_FRONTEND=noninteractive KUBECONFIG=/etc/kubernetes/admin.conf
  #- DEBIAN_FRONTEND=noninteractive apt-get update -q -y
  #- DEBIAN_FRONTEND=noninteractive apt-get install -y cri-o cri-o-runc apt-transport-https ca-certificates curl gnupg-agent software-properties-common jq golang-cfssl
  #- systemctl daemon-reload
  #- systemctl enable --now crio
  #- DEBIAN_FRONTEND=noninteractive apt-get install -q -y kubelet=1.28.3-1.1 kubectl=1.28.3-1.1
  #- DEBIAN_FRONTEND=noninteractive apt-mark hold kubelet kubectl
  - |
    curl -q -s -d '{"label": "primary"}' http://${CA_URL}:8888/api/v1/cfssl/info  |jq -r '.result.certificate' > /var/lib/kubelet/ca.pem
  - |
    cat <<CIEOF > /var/lib/kubelet/worker-csr.json
    {
      "CN": "system:node:\$(cat /etc/hostname)",
      "key": {
        "algo": "rsa",
        "size": 2048
      },
      "hosts": [
        "\$(cat /etc/hostname)",
        "\$(ip -4 -br --json a |jq -r '.[1].addr_info[].local')"
      ],
      "names": [
        {
          "O": "system:nodes"
        }
      ]
    }
    CIEOF
  - |
    cat <<CIEOF | cfssl gencert -config /dev/stdin -profile=client -profile=kubelet /var/lib/kubelet/worker-csr.json  |cfssljson -bare /var/lib/kubelet/worker
    {
     "auth_keys" : {
        "key1" : {
           "type" : "standard",
           "key" : "${AUTH_KEY}"
        }
     },
     "signing" : {
        "default" : {
           "auth_remote" : {
              "remote" : "cfssl_server",
              "auth_key" : "key1"
           }
        }
     },
     "remotes" : {
        "cfssl_server" : "${CA_URL}"
     }
    }
    CIEOF
  - KUBECONFIG=/var/lib/kubelet/kubeconfig kubectl config set-cluster default-cluster --server=https://${K8S_API}:6443 --certificate-authority /var/lib/kubelet/ca.pem --embed-certs
  - KUBECONFIG=/var/lib/kubelet/kubeconfig kubectl config set-credentials system:node:\$(cat /etc/hostname) --client-key /var/lib/kubelet/worker-key.pem --client-certificate /var/lib/kubelet/worker.pem --embed-certs
  - KUBECONFIG=/var/lib/kubelet/kubeconfig kubectl config set-context default-system --cluster default-cluster --user system:node:\$(cat /etc/hostname)
  - KUBECONFIG=/var/lib/kubelet/kubeconfig kubectl config use-context default-system
  - systemctl enable --now kubelet
```

To explain what will happen here, is that the worker node will fetch the CA certificate which will be the basis in order to create a Certificate Signing Request with its hostname and IP.

The CA, through CFSSL API, will respond with the corresponding worker node certificate and key.

I've been running this to successfully autojoin a worker node running as a bhyve guest, a Turing PI2 RK1 (Rockchip RK3558) node, a Turing PI2 CM4 node and a bare metal (pxe + cloud-init/autoinstall) node.

To be continued…
