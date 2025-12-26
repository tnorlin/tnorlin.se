---
title: k8s v1.32 + Cilium v.17.0 + illumos = true?
author: Tony Norlin
description: A reflection on my twenty years as a home lab tinkler.
featured: true
pubDatetime: 2025-02-05T15:05:15.922Z
draft: false
tags:
  - kubernetes
  - networking
  - illumos
  - homelab
  - bgp
keywords:
  - cilium
  - illumos
  - kubernetes
  - networking
  - homelab
  - bgp
---

Cilium v1.17.0 was released today and for me this was a long desired and important release, and I began my preparations a while ago. Actually I’ve been out of shape during the whole autumn and lacked the energy required to do the anticipated changes in the home infrastructure.

The k8s conformance test (https://github.com/cncf/k8s-conformanc) epassed (as expected, as have done for a couple of months in the main branch) with success:

```
Ran 411 of 6622 Specs in 6754.485 seconds
SUCCESS! -- 411 Passed | 0 Failed | 0 Pending | 6211 Skipped
PASS

Ginkgo ran 1 suite in 1h52m35.988135314s
Test Suite Passed
```

What does this actually mean? Well, that the solution conforms to the criterias set up by CNCF on how a kubernetes cluster should behave. As this is my home lab and rather (unique?!) “solution” (mess?), it will probably never be a certified kubernetes platform. But it proves that the concept would have potential, should one have the interest to buy a silver membership and go wild (and crazy).

I’ve earlier experimented with auto provisioning of worker nodes and now I wanted to transfer the concept to the control plane nodes in order to facilitate the provisioning of the whole platform.

![The initial design idea I had, roughly the same applies today.](/assets/ha-controlplane.png)_The initial design idea I had, roughly the same applies in today's solution._

At the same time I decided to support HA deployment of the external control plane, but not because I’ve experienced issued with the components. On the contrary, the control plane components have been playing nice (with a negligible resource consumption) and the only situation I can recall a crash were when Longhorn admission controller decided that my cluster should have almost 200 000(!) longhorn replicas. Little did I know by then about paging and optimising the API-queries.

---

## The inventory

I wanted to have a configuration store and at the same time explore the yq command, and as this is my own infrastructure I go by my own rules.

The inventory as it looks now:

```
cat << EOF > /var/tmp/inventory.yml
nodes:
  - name: etcd1
    role: etcd
    iface:
    - type: default
      ip: 10.128.0.70
      bitmask: 26
      vlan: 48
      route: none
  - name: etcd2
    role: etcd
    iface:
    - type: default
      ip: 10.128.0.71
      bitmask: 26
      vlan: 48
      route: none
  - name: etcd3
    role: etcd
    iface:
    - type: default
      ip: 10.128.0.72
      bitmask: 26
      vlan: 48
      route: none
  - name: apisrv1
    role: api
    iface:
    - type: default
      ip: 10.128.0.11
      bitmask: 26
      vlan: 47
      route: 10.128.0.60
    - name: other
      ip: 10.128.0.65
      bitmask: 26
      vlan: 48
      route: none
  - name: apisrv2
    role: api
    iface:
    - type: default
      ip: 10.128.0.12
      bitmask: 26
      vlan: 47
      route: 10.128.0.60
    - name: other
      ip: 10.128.0.66
      bitmask: 26
      vlan: 48
      route: none
  - name: apisrv3
    role: api
    iface:
    - type: default
      ip: 10.128.0.13
      bitmask: 26
      vlan: 47
      route: 10.128.0.60
    - name: other
      ip: 10.128.0.67
      bitmask: 26
      vlan: 48
      route: none
  - name: ctrlmgr1
    host_alias: true
    role: ctrl
    iface:
    - type: default
      ip: 10.128.0.14
      bitmask: 26
      vlan: 47
      route: none
  - name: ctrlmgr2
    host_alias: true
    role: ctrl
    iface:
    - type: default
      ip: 10.128.0.15
      bitmask: 26
      vlan: 47
      route: none
  - name: ctrlmgr3
    host_alias: true
    role: ctrl
    iface:
    - type: default
      ip: 10.128.0.16
      bitmask: 26
      vlan: 47
      route: none
  - name: k8sched1
    host_alias: true
    role: sched
    iface:
    - type: default
      ip: 10.128.0.17
      bitmask: 26
      vlan: 47
      route: none
  - name: k8sched2
    host_alias: true
    role: sched
    iface:
    - type: default
      ip: 10.128.0.18
      bitmask: 26
      vlan: 47
      route: none
  - name: k8sched3
    host_alias: true
    role: sched
    iface:
    - type: default
      ip: 10.128.0.19
      bitmask: 26
      vlan: 47
      route: none
zones:
  common:
    mem: 4G
    dns-domain: "k8s.ploio.net"
    resolvers: ["10.69.0.4", "10.69.0.5"]
    prefix: ""
    path: /zones/
    global-nic: aggr0
    brand: sparse
    proxy: http://10.69.0.3:3129
    k8s-binary-url: https://github.com/tnorlin/kubernetes/releases/download/v1.32.1-illumos/
    etcd-binary-url: https://github.com/tnorlin/etcd/releases/download/v3.5.16-illumos/
    cfssl-binary-url: https://github.com/tnorlin/cfssl/releases/download/v1.6.5-illumos/
    binaries:
      etcd:
      - etcdctl
      - etcd
      - etcdutl
      sched:
      - kube-scheduler
      - kubectl
      api:
      - kube-apiserver
      ctrl:
      - kube-controller-manager
      - kubectl
      cfssl:
      - cfssl
      - cfssljson
service:
  ip: 10.112.0.1
  dns: 10.112.0.10
  cidr: 10.112.0.0/12
  domain: kubernetes.default.svc.cluster.local
api:
  fqdn: infrak8s.k8s.ploio.net
  vip: 10.128.0.1
ca:
  country: SE
  state: .
  location: Stockholm
  apisrv-ca-ip: 172.16.10.34
  etcd-ca-ip: 172.16.10.35
  ctrlmgr-ca-ip: 172.16.10.34
  sched-ca-ip: 172.16.10.34
cluster:
  name: "infrak8s"
EOF
```

To understand better, a description of the above template would be necessary.

This defines following:

- the Kubernetes Service CIDR is stated as 10.112.0.0/12
- three ETCD nodes on VLAN 48
- three controller-manager nodes on VLAN 47
- three scheduler nodes on VLAN 47
- three API server nodes on both the ETCD VLAN and the control plane VLAN
  zone definitions
- IP of the two CFSSL API endpoints

## The CA

This script creates a CFSSL CA with API definitions for both the k8s certificates and the ETCD certificates.

```
cat << EOF > /var/tmp/create-ca
#!/usr/bin/env bash
(umask 0077 mkdir -p /opt/cfssl)
mkdir -p /opt/cfssl/{root-ca,kubernetes-ca,etcd-ca}

cd /opt/cfssl

AUTH_KEY=$(if [ ! -f auth_key ]; then openssl rand -hex 16 | (umask 0377 && tee auth_key) fi)
#AUTH_KEY2=$(if [ ! -f auth_key2 ]; then openssl rand -hex 16 | (umask 0377 && tee auth_key2) fi)
ETCD_AUTH_KEY=$(if [ ! -f etcd_auth_key ]; then openssl rand -hex 16 | (umask 0377 && tee etcd_auth_key) fi)
INVENTORY=$(cat inventory.yml)

commands="yq openssl cfssl find sqlite3"
for arg in ${commands}; do
  if ! command -v ${arg} 2>&1 >/dev/null
then
  echo "${arg} not in PATH"
  exit 1
fi
done


service_fqdn=$(yq ".service.domain " <<< "$INVENTORY")
service_ip=$(yq ".service.ip" <<< "$INVENTORY")
service_dns=$(yq ".service.dns" <<< "$INVENTORY")
etcd_ca_ip=$(yq ".ca.etcd-ca-ip" <<< "${INVENTORY}")
k8s_ca_ip=$(yq ".ca.apisrv-ca-ip" <<< "${INVENTORY}")
ca_auth_key=$(< auth_key)
ca_auth_key2=$(< auth_key)
#ca_auth_key2=$(< auth_key2)
etcdca_auth_key=$(< etcd_auth_key)
ca_country=$(yq ".ca.country" <<< "$INVENTORY")
ca_state=$(yq ".ca.state" <<< "$INVENTORY")
ca_location=$(yq ".ca.location" <<< "$INVENTORY")
etcd_ips=$(yq "[.nodes[] | select(.role == \"etcd\") | (.iface[0].ip) | ... style=\"double\" ]|  to_json(0) " <<< "${INVENTORY}" | tr -d '[]')

while IFS='.' read -ra ADDR; do
  for (( i = 0; i < ${#ADDR[@]}; i++ )); do
     if (( i > 0)); then
     s+="."
     fi
     s+="${ADDR[$i]}"
     d+="$s "
  done
done <<< "$service_fqdn"

apiserver_name=$(yq "[.api.fqdn][]" <<< "$INVENTORY")


# CA Configs
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
cfssl genkey -initca kubernetes-ca/kubernetes-ca-csr.json | cfssljson -bare kubernetes-ca/kubernetes-ca
cfssl sign -ca root-ca/ca.pem -ca-key root-ca/ca-key.pem -config root-ca/root-ca-config.json -profile intermediate kubernetes-ca/kubernetes-ca.csr | cfssljson -bare kubernetes-ca/kubernetes-ca

cat << EOF > kubernetes-ca/kubernetes-ca-config.json
{
    "signing": {
        "default": {
            "auth_key": "key1",
            "ocsp_url": "http://${k8s_ca_ip}:8889",
            "crl_url": "http://${k8s_ca_ip}:8888/crl",
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
                "auth_key": "key2",
                "usages": [
                    "signing",
                    "key encipherment",
                    "client auth",
                    "server auth"
                ]
            },
            "client": {
                "auth_key": "key2",
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
      "key": "${ca_auth_key}",
      "type": "standard"
    },
    "key2": {
      "key": "${ca_auth_key2}",
      "type": "standard"
    }
  }
}
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
      "C": "${ca_country}",
      "ST": "${ca_state}",
      "L": "${ca_location}"
    }
  ]
}
EOF

cfssl gencert -ca=kubernetes-ca/kubernetes-ca.pem -ca-key=kubernetes-ca/kubernetes-ca-key.pem -config=kubernetes-ca/kubernetes-ca-config.json -profile="ocsp" ocsp-csr.json |cfssljson -bare ocsp

cat << EOF > etcd-ca/etcd-ca-config.json
{
    "signing": {
        "default": {
            "auth_key": "etcdkey",
            "ocsp_url": "http://${etcd_ca_ip}:8891",
            "crl_url": "http://${etcd_ca_ip}:8890/crl",
            "expiry": "168h"
        },
        "profiles": {
            "server": {
                "auth_key": "etcdkey",
                "expiry": "8700h",
                "usages": [
                    "signing",
                    "key encipherment",
                    "server auth",
                    "client auth"
                ]
            },
            "ocsp": {
              "auth_key": "etcdkey",
              "usages": [
                "digital signature",
                "ocsp signing"
              ],
              "expiry": "26280h"
            },
            "client": {
              "auth_key": "etcdkey",
                "expiry": "8700h",
                "usages": [
                    "signing",
                    "key encipherment",
                    "client auth"
                ]
            },
            "peer": {
              "auth_key": "etcdkey",
                "expiry": "8700h",
                "usages": [
                    "signing",
                    "key encipherment",
                    "server auth",
                    "client auth"
                ]
            }
        }
    },
  "auth_keys": {
    "etcdkey": {
      "key": "${etcdca_auth_key}",
      "type": "standard"
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

cfssl gencert -ca=etcd-ca/etcd-ca.pem -ca-key=etcd-ca/etcd-ca-key.pem -config=etcd-ca/etcd-ca-config.json -profile="ocsp" ocsp-csr.json | cfssljson -bare etcd-ocsp


openssl genrsa -out sa.key 2048
openssl rsa -in sa.key -pubout -out sa.pub


cat << EOF > k8scerts.sql
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

cat k8scerts.sql | sqlite3 k8scerts.db

cat << EOF > sqlite_k8scerts.json
{"driver":"sqlite3","data_source":"k8scerts.db"}
EOF

cat k8scerts.sql | sqlite3 etcdcerts.db

cat << EOF > sqlite_etcdcerts.json
{"driver":"sqlite3","data_source":"etcdcerts.db"}
EOF


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


# Rename pem to crt
find . -name "*-key.pem" -exec bash -c 'mv "$1" "${1%-key.pem}".key' - '{}' \;
find . -name "*.pem" -exec bash -c 'mv "$1" "${1%.pem}".crt' - '{}' \;
EOF
```

## The Zone creation

I mentioned that I decided on the inventory format due to curiosity of the yq command, well that is probably evident of this script’s messy structure where I redesigned the flow as my nightly ideas went by. At first I weren’t really planning for auto generation of the zone certificates, then I did it upon launch of the service (hence the method scripts in turn referenced to the start-svc.sh as it was launching the API calls to CFSSL in order to regenerate a new certificate upon service restart.) It turned out to be a really bad design decition in several ways as ETCD, controller-manager and kube-scheduler are isolated and only able to reach the kube-apiservers. To allow the components to reach the API.. as well as being able to generate its own (and others) certificate. No, it certainly had to be done from the global zone.

Although, I kept the `start-svc.sh` script as some of the components wants to embed the certificates into kubeconfigs.

```
cat <<EOF > /var/tmp/create-zone
#!/usr/bin/env bash
cd /opt/cfssl
INVENTORY=$(cat inventory.yml)

hosts=$(yq ".nodes[].name" <<< "${INVENTORY}")
mem=$(yq ".zones.common.mem" <<< "${INVENTORY}")
brand=$(yq ".zones.common.brand" <<< "${INVENTORY}")
dnsdomain=$(yq ".zones.common.dns-domain" <<< "${INVENTORY}")
resolvers=$(yq ".zones.common.resolvers" <<< "${INVENTORY}")
prefix=$(yq ".zones.common.prefix" <<< "${INVENTORY}")
path=$(yq ".zones.common.path" <<< "${INVENTORY}")
globalnic=$(yq ".zones.common.global-nic" <<< "${INVENTORY}")
brand=$(yq ".zones.common.brand" <<< "${INVENTORY}")
proxy=$(yq ".zones.common.proxy" <<< "${INVENTORY}")
path=$(yq ".zones.common.path" <<< "${INVENTORY}")
cluster_name=$(yq ".cluster.name" <<< "${INVENTORY}")
service_cidr=$(yq ".service.cidr" <<< "${INVENTORY}")
service_fqdn=$(yq ".service.domain" <<< "${INVENTORY}")
service_ip=$(yq ".service.ip" <<< "${INVENTORY}")
api_fqdn=$(yq ".api.fqdn" <<< "${INVENTORY}")
api_vip=$(yq ".api.vip" <<< "${INVENTORY}")
etcd_ips=$(yq ".nodes[] | select(.role == \"etcd\") | (.iface[0].ip)" <<< "${INVENTORY}")
etcd_names=$(yq ".nodes[] | select(.role == \"etcd\").name" <<< "${INVENTORY}")
etcd_ip=(${etcd_ips})
etcd_name=(${etcd_names})

encryption_key=$(if [ ! -f encryption_key ]; then head -c 32 /dev/urandom | base64 | (umask 0377 && tee encryption_key) fi)
ca_auth_key=$(< auth_key)
etcdca_auth_key=$(< etcd_auth_key)

ca_etcd_ips=$(yq "[.nodes[] | select(.role == \"etcd\") | (.iface[0].ip) | ... style=\"double\" ]|  to_json(0) " <<< "${INVENTORY}" | tr -d '[]')
ca_etcd_names=$(yq  "[.nodes[] | select(.role == \"etcd\").name| ... style=\"double\" ]|  to_json(0)" <<< "${INVENTORY}" | tr -d '[]' )
apisrv_names=$(yq "[.nodes[] | select(.role == \"api\")  | .name   | ... style=\"double\" ] | to_json(0)" <<< "${INVENTORY}" | tr -d '[]')
apisrv_ips=$(yq "[.nodes[] | select(.role == \"api\") | (.iface[0].ip) | ... style=\"double\" ]|  to_json(0)" <<< "${INVENTORY}" | tr -d '[]')
etcd_ca_ip=$(yq ".ca.etcd-ca-ip" <<< "${INVENTORY}")
k8s_ca_ip=$(yq ".ca.apisrv-ca-ip" <<< "${INVENTORY}")
ctrlmgr_ca_ip=$(yq ".ca.ctrlmgr-ca-ip" <<< "${INVENTORY}")
sched_ca_ip=$(yq ".ca.sched-ca-ip" <<< "${INVENTORY}")

zone_file () {
  zone=$(yq -ojson ".nodes[] | select(.name == \"${1}\")" <<< "${INVENTORY}")
  zonename=$(yq ".name" <<< "${zone}")
  role=$(yq ".role" <<< "${zone}")
  ip=$(yq ".iface[0].ip" <<< "${zone}")
  host_alias=$(yq ".nodes[] | select(.name == \"${1}\").host_alias" <<< "${INVENTORY}")
  zona=($(yq ".nodes[] | select(.name == \"${1}\").iface[] |[.ip,.bitmask,.vlan,.route]  | . style=\"double\"" <<< "${INVENTORY}"))
  ifaces=$(yq "[.iface[]] | length" <<< "${zone}") bitmask=$(yq ".iface[0].bitmask" <<< "${zone}")
  vlan=$(yq ".iface[0].vlan" <<< "${zone}")
  interface=${zonename//[[:digit:]]/}
  echo "Creating zone script ${zonename}"
  ins=($ifaces)
}

role () {

case ${1} in

  etcd)
    desc="ETCD v3"
    name="etcd"
    script="/opt/local/bin/etcd \
    --advertise-client-urls=https://${ip}:2379 \
    --cert-file=/opt/local/etc/server.pem \
    --client-cert-auth=true --data-dir=/opt/local/data/etcd \
    --initial-advertise-peer-urls=https://${ip}:2380 \
    --initial-cluster=${prefix}${etcd_name[0]}=https://${etcd_ip[0]}:2380,\
${prefix}${etcd_name[1]}=https://${etcd_ip[1]}:2380,\
${prefix}${etcd_name[2]}=https://${etcd_ip[2]}:2380 \
    --initial-cluster-state=new \
    --key-file=/opt/local/etc/server-key.pem \
    --listen-client-urls=https://${ip}:2379 \
    --listen-metrics-urls=http://127.0.0.1:2381 \
    --listen-peer-urls=https://${ip}:2380 \
    --name=${prefix}${zonename} \
    --peer-cert-file=/opt/local/etc/peer.pem \
    --peer-client-cert-auth=true \
    --peer-key-file=/opt/local/etc/peer-key.pem \
    --peer-trusted-ca-file=/opt/local/etc/ca.crt \
    --snapshot-count=10000 \
    --trusted-ca-file=/opt/local/etc/ca.crt > /var/log/etcd.log\
     2>&1 &"

cat << EOF4 > ${zonename}-start-svc.sh
${script}
EOF4
chmod +x ${zonename}-start-svc.sh

cat << EOF5 > ${zonename}-server-csr.json
{
  "CN": "${zonename}",
  "hosts": [
    ${ca_etcd_names},
    ${ca_etcd_ips},
    "localhost",
    "127.0.0.1"
  ],
  "key": {
    "algo": "rsa",
    "size": 2048
  }
}
EOF5
cat << EOF5 > ${zonename}-peer-csr.json
{
  "CN": "${zonename}",
  "hosts": [
    ${ca_etcd_names},
    ${ca_etcd_ips},
    "localhost",
    "127.0.0.1"
  ],
  "key": {
    "algo": "rsa",
    "size": 2048
  }
}
EOF5
    csr_files=$(cat <<-EOFCSR

cat <<CSREOF | ${zonepath}/root/opt/local/bin/cfssl gencert -remote "${etcd_ca_ip}" -config /dev/stdin -profile=server ${zonepath}/root/opt/local/etc/server-csr.json  | ${zonepath}/root/opt/local/bin/cfssljson -bare ${zonepath}/root/opt/local/etc/server
{
 "auth_keys" : {
    "etcdkey" : {
       "type" : "standard",
       "key" : "${etcdca_auth_key}"
    }
 },
 "signing" : {
    "default" : {
       "auth_remote" : {
          "remote" : "cfssl_server",
          "auth_key" : "etcdkey"
       }
    }
 },
 "remotes" : {
    "cfssl_server" : "${etcd_ca_ip}"
 }
}
CSREOF

cat <<CSREOF | ${zonepath}/root/opt/local/bin/cfssl gencert -remote "${etcd_ca_ip}" -config /dev/stdin -profile=peer ${zonepath}/root/opt/local/etc/peer-csr.json  | ${zonepath}/root/opt/local/bin/cfssljson -bare ${zonepath}/root/opt/local/etc/peer
{
 "auth_keys" : {
    "etcdkey" : {
       "type" : "standard",
       "key" : "${etcdca_auth_key}"
    }
 },
 "signing" : {
    "default" : {
       "auth_remote" : {
          "remote" : "cfssl_server",
          "auth_key" : "etcdkey"
       }
    }
 },
 "remotes" : {
    "cfssl_server" : "${etcd_ca_ip}"
 }
}
CSREOF

EOFCSR
)

    cert_files=$(cat <<-EOF3
    cat <<EOF | /usr/gnu/bin/base64 -d | (cd ${zonepath}/root; /usr/gnu/bin/tar -xzf -)
$(cd /opt/cfssl;/usr/gnu/bin/tar --transform=s,^,/opt/local/etc/, --transform=s,${zonename}-peer,peer, --transform=s,${zonename}-start-svc,start-svc, --transform=s,${zonename}-server,server, --transform=s,etcd-ca/etcd-ca.crt,ca.crt, -czf - ${zonename}-server-csr.json ${zonename}-peer-csr.json etcd-ca/etcd-ca.crt  ${zonename}-start-svc.sh |base64)
EOF
EOF3
)
    config=""
    ;;
  api)
    desc="Kubernetes Apiserver"
    name="kube-apiserver"
    script="/opt/local/bin/kube-apiserver \
    --advertise-address=${ip} \
    --allow-privileged=true \
    --audit-log-maxage=30 \
    --audit-log-maxbackup=3 \
    --audit-log-maxsize=100 \
    --audit-log-path=/var/log/audit.log \
    --authorization-mode=Node,RBAC \
    --bind-address=0.0.0.0 \
    --client-ca-file=/opt/local/etc/ca.crt \
    --enable-admission-plugins=NodeRestriction \
    --enable-bootstrap-token-auth=true \
    --etcd-cafile=/opt/local/etc/etcd-ca.crt \
    --etcd-certfile=/opt/local/etc/apiserver-etcd-client.pem \
    --etcd-keyfile=/opt/local/etc/apiserver-etcd-client-key.pem \
    --etcd-servers=https://${etcd_ip[0]}:2379,https://${etcd_ip[1]}:2379,https://${etcd_ip[2]}:2379 \
    --event-ttl=1h \
    --encryption-provider-config=/opt/local/etc/encryption-config.yaml \
    --kubelet-preferred-address-types=Hostname,InternalIP,ExternalIP,Hostname \
    --kubelet-certificate-authority=/opt/local/etc/ca.crt \
    --kubelet-client-certificate=/opt/local/etc/apiserver-kubelet-client.pem \
    --kubelet-client-key=/opt/local/etc/apiserver-kubelet-client-key.pem \
    --secure-port=6443 \
    --service-account-key-file=/opt/local/etc/sa.pub \
    --service-account-signing-key-file=/opt/local/etc/sa.key \
    --service-account-issuer=https://${service_fqdn}:6443 \
    --service-cluster-ip-range=${service_cidr} \
    --service-node-port-range=30000-32767 \
    --tls-cert-file=/opt/local/etc/apiserver.pem \
    --tls-private-key-file=/opt/local/etc/apiserver-key.pem \
    --external-hostname=${api_fqdn} \
    --v=0 > /var/log/kube-apiserver.log 2>&1 &"

cat << EOF4 > ${zonename}-start-svc.sh

${script}
EOF4
chmod +x ${zonename}-start-svc.sh


cat << EOF5 > ${zonename}-csr.json
{
  "CN": "${zonename}",
  "hosts": [
    ${apisrv_names},
    ${apisrv_ips},
    "${service_ip}",
    "${api_fqdn}",
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
EOF5

cat << EOF5 > ${zonename}-etcd-client-csr.json
{
  "CN": "kube-${zonename}-etcd-client",
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
EOF5

cat << EOF5 > ${zonename}-kubelet-client-csr.json
{
  "CN": "kube-${zonename}-kubelet-client",
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
EOF5
# consider kubeadm:cluster-admins
    csr_files=$(cat <<-EOFCSR
cat <<CSREOF | ${zonepath}/root/opt/local/bin/cfssl gencert -remote "${etcd_ca_ip}" -config /dev/stdin -profile=client ${zonepath}/root/opt/local/etc/apiserver-etcd-client-csr.json  | ${zonepath}/root/opt/local/bin/cfssljson -bare ${zonepath}/root/opt/local/etc/apiserver-etcd-client
{
 "auth_keys" : {
    "etcdkey" : {
       "type" : "standard",
       "key" : "${etcdca_auth_key}"
    }
 },
 "signing" : {
    "default" : {
       "auth_remote" : {
          "remote" : "cfssl_server",
          "auth_key" : "etcdkey"
       }
    }
 },
 "remotes" : {
    "cfssl_server" : "${etcd_ca_ip}"
 }
}
CSREOF

cat <<CSREOF | ${zonepath}/root/opt/local/bin/cfssl gencert -remote "${k8s_ca_ip}" -config /dev/stdin -profile=client ${zonepath}/root/opt/local/etc/apiserver-kubelet-client-csr.json  | ${zonepath}/root/opt/local/bin/cfssljson -bare ${zonepath}/root/opt/local/etc/apiserver-kubelet-client
{
 "auth_keys" : {
    "key1" : {
       "type" : "standard",
       "key" : "${ca_auth_key}"
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
    "cfssl_server" : "${k8s_ca_ip}"
 }
}
CSREOF

cat <<CSREOF | ${zonepath}/root/opt/local/bin/cfssl gencert -remote "${k8s_ca_ip}" -config /dev/stdin -profile=www ${zonepath}/root/opt/local/etc/apiserver-csr.json  | ${zonepath}/root/opt/local/bin/cfssljson -bare ${zonepath}/root/opt/local/etc/apiserver
{
 "auth_keys" : {
    "key1" : {
       "type" : "standard",
       "key" : "${ca_auth_key}"
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
    "cfssl_server" : "${k8s_ca_ip}"
 }
}
CSREOF

EOFCSR
)

    cert_files=$(cat <<-EOF3
    cat <<EOF | /usr/gnu/bin/base64 -d | (cd ${zonepath}/root; /usr/gnu/bin/tar -xzf -)
$(cd /opt/cfssl;/usr/gnu/bin/tar --transform=s,^,/opt/local/etc/, --transform=s,kubernetes-ca/kubernetes-ca.crt,ca.crt, --transform=s,${zonename}-start-svc,start-svc, --transform=s,${zonename}-,apiserver-, --transform=s,etcd-ca/etcd-ca.crt,etcd-ca.crt, -czf - kubernetes-ca/kubernetes-ca.crt etcd-ca/etcd-ca.crt ${zonename}-etcd-client-csr.json ${zonename}-kubelet-client-csr.json ${zonename}-csr.json sa.{pub,key} ${zonename}-start-svc.sh | base64)
EOF
EOF3
)
    config=$(cat <<-EOF3
cat > ${zonepath}/root/opt/local/etc/encryption-config.yaml <<EOF2
kind: EncryptionConfig
apiVersion: v1
resources:
  - resources:
      - secrets
    providers:
      - aescbc:
          keys:
            - name: key1
              secret: ${encryption_key}
      - identity: {}
EOF2
EOF3
)
    ;;
  ctrl)
    desc="Kubernetes Controller Manager"
    name="kube-controller-manager"
    script="/opt/local/bin/kube-controller-manager \
    --bind-address=0.0.0.0 \
    --cluster-name=${cluster_name} \
    --cluster-signing-cert-file=/opt/local/etc/ca.crt \
    --cluster-signing-key-file=/opt/local/etc/ca.key \
    --kubeconfig=/opt/local/etc/controller-manager.conf \
    --leader-elect=true \
    --root-ca-file=/opt/local/etc/ca.crt \
    --service-account-private-key-file=/opt/local/etc/sa.key \
    --service-cluster-ip-range=${service_cidr} \
    --use-service-account-credentials=true \
    --requestheader-client-ca-file=/opt/local/etc/ca.crt \
    --authorization-kubeconfig=/opt/local/etc/controller-manager.conf \
    --authentication-kubeconfig=/opt/local/etc/controller-manager.conf \
    --v=2 > /var/log/kube-controller-manager.log 2>&1 &"
    config=""

cat << EOF4 > ${zonename}-start-svc.sh
KUBECONFIG=/opt/local/etc/controller-manager.conf /opt/local/bin/kubectl config set-cluster default-cluster --server=https://${api_fqdn}:6443 --certificate-authority /opt/local/etc/ca.crt --embed-certs
KUBECONFIG=/opt/local/etc/controller-manager.conf /opt/local/bin/kubectl config set-credentials default-controller-manager --client-key /opt/local/etc/controller-manager-key.pem --client-certificate /opt/local/etc/controller-manager.pem --embed-certs
KUBECONFIG=/opt/local/etc/controller-manager.conf /opt/local/bin/kubectl config set-context default-system --cluster default-cluster --user default-controller-manager
KUBECONFIG=/opt/local/etc/controller-manager.conf /opt/local/bin/kubectl config use-context default-system


${script}
EOF4
chmod +x ${zonename}-start-svc.sh

# Kube Controller Manager
cat << EOF5 > ${zonename}-controller-manager-csr.json
{
  "CN": "system:kube-controller-manager",
  "key": {
    "algo": "rsa",
    "size": 2048
  }
}
EOF5
    csr_files=$(cat <<-EOFCSR

cat <<CSREOF | ${zonepath}/root/opt/local/bin/cfssl gencert -remote "${k8s_ca_ip}" -config /dev/stdin -profile=client ${zonepath}/root/opt/local/etc/controller-manager-csr.json  | ${zonepath}/root/opt/local/bin/cfssljson -bare ${zonepath}/root/opt/local/etc/controller-manager
{
 "auth_keys" : {
    "key1" : {
       "type" : "standard",
       "key" : "${ca_auth_key}"
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
    "cfssl_server" : "${k8s_ca_ip}"
 }
}
CSREOF

EOFCSR
)

    cert_files=$(cat <<-EOF3
    cat <<EOF | /usr/gnu/bin/base64 -d | (cd ${zonepath}/root; /usr/gnu/bin/tar -xzf -)
$(cd /opt/cfssl;/usr/gnu/bin/tar  --transform=s,^,/opt/local/etc/, --transform=s,kubernetes-ca/kubernetes-ca,ca, --transform=s,${zonename}-start-svc,start-svc,  --transform=s,${zonename}-,, -czf - sa.key ${zonename}-controller-manager-csr.json kubernetes-ca/kubernetes-ca.{crt,key} ${zonename}-start-svc.sh | base64)
EOF
EOF3
)
    ;;
  sched)
    desc="Kubernetes Scheduler"
    name="kube-sched"
    script="/opt/local/bin/kube-scheduler \
    --config=/opt/local/etc/kube-scheduler.yaml  \
    --v=2 > /var/log/kube-scheduler.log 2>&1 &"
    config=$(cat <<-EOF3
cat > ${zonepath}/root/opt/local/etc/kube-scheduler.yaml <<EOF
apiVersion: kubescheduler.config.k8s.io/v1
kind: KubeSchedulerConfiguration
clientConnection:
  kubeconfig: "/opt/local/etc/scheduler.conf"
leaderElection:
  leaderElect: true
EOF
EOF3
)
cat << EOF4 > ${zonename}-start-svc.sh
KUBECONFIG=/opt/local/etc/scheduler.conf /opt/local/bin/kubectl config set-cluster default-cluster --server=https://${api_fqdn}:6443 --certificate-authority /opt/local/etc/ca.crt --embed-certs
KUBECONFIG=/opt/local/etc/scheduler.conf /opt/local/bin/kubectl config set-credentials default-scheduler --client-key /opt/local/etc/scheduler-key.pem --client-certificate /opt/local/etc/scheduler.pem --embed-certs
KUBECONFIG=/opt/local/etc/scheduler.conf /opt/local/bin/kubectl config set-context default-system --cluster default-cluster --user default-scheduler
KUBECONFIG=/opt/local/etc/scheduler.conf /opt/local/bin/kubectl config use-context default-system

${script}
EOF4
chmod +x ${zonename}-start-svc.sh

# Kube Scheduler
cat << EOF5 > ${zonename}-scheduler-csr.json
{
  "CN": "system:kube-scheduler",
  "key": {
    "algo": "rsa",
    "size": 2048
  }
}
EOF5


    csr_files=$(cat <<-EOFCSR

cat <<CSREOF | ${zonepath}/root/opt/local/bin/cfssl gencert -remote "${k8s_ca_ip}" -config /dev/stdin -profile=client ${zonepath}/root/opt/local/etc/scheduler-csr.json  | ${zonepath}/root/opt/local/bin/cfssljson -bare ${zonepath}/root/opt/local/etc/scheduler
{
 "auth_keys" : {
    "key1" : {
       "type" : "standard",
       "key" : "${ca_auth_key}"
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
    "cfssl_server" : "${k8s_ca_ip}"
 }
}
CSREOF

EOFCSR
)



    cert_files=$(cat <<-EOF3
    cat <<EOF | /usr/gnu/bin/base64 -d | (cd ${zonepath}/root; /usr/gnu/bin/tar -xzf -)
$(cd /opt/cfssl;/usr/gnu/bin/tar  --transform=s,^,/opt/local/etc/, --transform=s,kubernetes-ca/kubernetes-ca,ca, --transform=s,${zonename}-start-svc,start-svc, --transform=s,${zonename}-,, -czf - ${zonename}-scheduler-csr.json kubernetes-ca/kubernetes-ca.crt ${zonename}-start-svc.sh | base64)
EOF
EOF3
)
    ;;
  *)
    echo "Invalid role defined!"
    exit 1
    ;;
esac
}

for i in ${hosts}; do
zone_file ${i};

zonepath=${path}${prefix}${i}

if [ "${host_alias}" == "true" ]; then
  host_alias="printf \"${api_vip} ${api_fqdn}\" >> ${zonepath}/root/etc/hosts"
else
  host_alias=""
fi

binaries=$(cat <<-EOF
$(for bin in $(yq ".zones[].binaries | with_entries(select(.key | test(\"$role\"))) | (.[] as \$foo | \$foo)[]" <<< "${INVENTORY}"); do

if [ "${role}" == "etcd" ]; then
binary_url=$(yq ".zones.common.etcd-binary-url" <<< "${INVENTORY}")
else
binary_url=$(yq ".zones.common.k8s-binary-url" <<< "${INVENTORY}")
fi

if [ -z "${proxy}" ]; then
  echo "curl -o ${zonepath}/root/opt/local/bin/${bin} -L ${binary_url}${bin}"
else
  echo "curl -x ${proxy} -o ${zonepath}/root/opt/local/bin/${bin} -L ${binary_url}${bin}"
fi

echo "chmod +x ${zonepath}/root/opt/local/bin/${bin}"
done
)
EOF
)
cfssl_binaries=$(cat <<-EOF
$(for bin in $(yq ".zones[].binaries | with_entries(select(.key | test(\"cfssl\"))) | (.[] as \$foo | \$foo)[]" <<< "${INVENTORY}"); do

cfssl_binary_url=$(yq ".zones.common.cfssl-binary-url" <<< "${INVENTORY}")

if [ -z "${proxy}" ]; then
  echo "curl -o ${zonepath}/root/opt/local/bin/${bin} -L ${cfssl_binary_url}${bin}"
else
  echo "curl -x ${proxy} -o ${zonepath}/root/opt/local/bin/${bin} -L ${cfssl_binary_url}${bin}"
fi

echo "chmod +x ${zonepath}/root/opt/local/bin/${bin}"
done
)
EOF
)



ziface=" \"net\" : ["
for (( g = 0; g < ${ifaces}; g++ )); do
        if (( ${g} << (${ifaces}-1) )) ; then
                ziface+=","
        fi

ziface+="   {"
ziface+="    \"allowed-address\" : \"$(yq ".iface[${g}].ip" <<< "${zone}")/$(yq ".iface[${g}].bitmask" <<< "${zone}")\","
ziface+="    \"global-nic\" : \"${globalnic}\","
ziface+="    \"vlan-id\": \"$(yq ".iface[${g}].vlan" <<< "${zone}")\","
ziface+="    \"physical\" : \"${interface}${i#${i%%[0-9]}}${g}\""
ziface+="   }"
done
ziface+="   ],"


role ${role};
cat << EOF > ${i}.create.sh
#/usr/bin/env bash

cat <<EEOF | zadm create -b ${brand} "${prefix}${i}" < /dev/stdin
{
   "autoboot" : "false",
   "bootargs" : "",
   "brand" : "${brand}",
   "capped-memory" : {
      "locked" : "${mem}",
      "physical" : "${mem}",
      "swap" : "${mem}"
   },
   "cpu-shares" : "1",
   "dns-domain" : "${dnsdomain}",
   "fs-allowed" : "",
   "hostid" : "",
   "ip-type" : "exclusive",
   "limitpriv" : "default",
   ${ziface}
   "pool" : "",
   "resolvers" : ${resolvers},
   "scheduling-class" : "",
   "zonename" : "${i}",
   "zonepath" : "${zonepath}"
}
EEOF

mkdir -p ${zonepath}/root/opt/local/{etc,bin}

cat << EEOF > ${zonepath}/root/lib/svc/method/${name}
#!/sbin/sh
#
# CDDL HEADER START
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
#ident  "%Z%%M% %I%     %E% SMI"#
# Start/Stop client LDAP service
#. /lib/svc/share/smf_include.sh
case "\\\$1" in
'start')
        exec /opt/local/etc/start-svc.sh
        ;;
'stop')
        exec /usr/bin/pkill ${name}
        ;;*)
        echo "Usage: \\\$0 { start | stop }"
        exit 1
        ;;
esac
EEOF
${binaries}
${cfssl_binaries}
chmod +x ${zonepath}/root/lib/svc/method/${name}


cat << EEOF > ${zonepath}/root/var/svc/manifest/site/${name}.xml
<?xml version="1.0"?>
<!DOCTYPE service_bundle SYSTEM "/usr/share/lib/xml/dtd/service_bundle.dtd.1">
<!--
    Manifest automatically generated by smfgen.
 -->
<service_bundle type="manifest" name="application-${name}" >
    <service name="application/${name}" type="service" version="2" >
        <create_default_instance enabled="true" />
        <dependency name="dep0" grouping="require_all" restart_on="error" type="service" >
            <service_fmri value="svc:/milestone/multi-user:default" />
        </dependency>
        <exec_method type="method" name="start" exec="/lib/svc/method/${name} start" timeout_seconds="30" />
        <exec_method type="method" name="stop" exec=":kill" timeout_seconds="30" />
        <template >
            <common_name >
                <loctext xml:lang="C" >${desc}</loctext>
            </common_name>
        </template>
    </service>
</service_bundle>
EEOF

${cert_files}

${config}
${csr_files}
${host_alias}

EOF
done


### Serve the CFSSL CA API
## cfssl serve -address=172.16.10.35 -port=8888 -db-config=/opt/cfssl/sqlite_etcdcerts.json -ca=/opt/cfssl/etcd-ca/etcd-ca.crt -ca-key=/opt/cfssl/etcd-ca/etcd-ca.key -config=/opt/cfssl/etcd-ca/etcd-ca-config.json -responder=/opt/cfssl/etcd-ocsp.crt -responder-key=/opt/cfssl/etcd-ocsp.key
##  cfssl serve -address=172.16.10.34 -port=8888 -db-config=/opt/cfssl/sqlite_k8scerts.json -ca=/opt/cfssl/kubernetes-ca/kubernetes-ca.crt -ca-key=/opt/cfssl/kubernetes-ca/kubernetes-ca.key -config=/opt/cfssl/kubernetes-ca/kubernetes-ca-config.json -responder=/opt/cfssl/ocsp.crt -responder-key=/opt/cfssl/ocsp.key
```

## Getting the Kubernetes control plane in place

To run the scripts, move the files to `/opt/cfssl`, modify the inventory file to your needs and execute them in your favorite shell. The produced shell script files should be ran from a global zone

```
ls *create.sh
apisrv1.create.sh   apisrv3.create.sh   ctrlmgr2.create.sh  etcd1.create.sh     etcd3.create.sh     k8sched2.create.sh
apisrv2.create.sh   ctrlmgr1.create.sh  ctrlmgr3.create.sh  etcd2.create.sh     k8sched1.create.sh  k8sched3.create.sh
```

IF the API were created as a non-global zone on the same physical host as the control plane zones are ment to run, then create the ETCD with something similar to:

```
for i in etcd{1..3} ; do sh /zones/cfsslzone/root/opt/cfssl/${i}.create.sh & done
```

Check that the ETCD is up and running with something similar to:

```
zlogin etcd1 /opt/local/bin/etcdctl --key /opt/local/etc/server-key.pem --cert /opt/local/etc/server.pem --cacert /opt/local/etc/ca.crt --endpoints 10.128.0.70:2379,10.128.0.71:2379,10.128.0.72:2379 member list

6398ec7566deca90, started, etcd1, https://10.128.0.70:2380, https://10.128.0.70:2379, false
db9770fa6eb5714a, started, etcd3, https://10.128.0.72:2380, https://10.128.0.72:2379, false
ec5e1b072015cc9d, started, etcd2, https://10.128.0.71:2380, https://10.128.0.71:2379, false
```

If all nodes are started, then proceed with the rest of the control plane like:

```
for i in apisrv{1..3} ctrlmgr{1..3} k8sched{1..3}; do sh /zones/cfsslzone/root/opt/cfssl/${i}.create.sh & done
```

## The data plane (worker nodes) network

Creation of BGP routing with FRR and HAproxy is out of scope in this article, but I found it neat to have both components running together and act as both the API server and worker node routers.

At the same time I’ve left out the provisioning of worker nodes as I want to do a retake on the cloud-init / PXE / bootstrap. In it’s current shape, I had the generation of certificate upon installation and that I want to keep. However, I want to explore a way to do this without exposing the authentication_key as I’ve not managed to slice the requests to the API.

## Installation of Cilium v1.17

A sample of the values, relevant parts (besides the kubeProxyReplacement) is bgpControlPlane, bpf.lbExternalClusterIP.

```
cat << EOF > cilium-values.yaml
bgpControlPlane:
  enabled: true
bpf:
  lbExternalClusterIP: true
cluster:
  name: infrak8s
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
    enabled:
    - dns
    - drop
    - tcp
    - icmp
    - flow:sourceContext=workload-name|reserved-identity;destinationContext=workload-name|reserved-identity
    - kafka:labelsContext=source_namespace,source_workload,destination_namespace,destination_workload,traffic_direction;sourceContext=workload-name|reserved-identity;destinationContext=workload-name|reserved-identity
    - httpV2:exemplars=true;labelsContext=source_ip,source_namespace,source_workload,destination_ip,destination_namespace,destination_workload,traffic_direction;sourceContext=workload-name|reserved-identity;destinationContext=workload-name|reserved-identity
    serviceMonitor:
      enabled: true
  relay:
    enabled: true
  ui:
    enabled: true
ingressController:
  default: true
  enabled: true
  loadbalancerMode: dedicated
ipam:
  mode: cluster-pool
k8sServiceHost: infrak8s.k8s.ploio.net
k8sServicePort: 6443
kubeProxyReplacement: true
operator:
  replicas: 1
prometheus:
  enabled: true
  serviceMonitor:
    enabled: true
rollOutCiliumPods: true
EOF
```

Install with:

```
helm install cilium cilium/cilium --version 1.17.0 --namespace=kube-system -f cilium-values.yaml
```

This is not strictly necessary, but as one would want to expose `LoadBalancer` type of services and benefit from the service mesh, it is handy to creata a pool:

```
cat << EOF | kubectl create -f -
apiVersion: cilium.io/v2alpha1
kind: CiliumLoadBalancerIPPool
metadata:
  annotations:
    kubectl.kubernetes.io/last-applied-configuration: |
      {"apiVersion":"cilium.io/v2alpha1","kind":"CiliumLoadBalancerIPPool","metadata":{"annotations":{},"name":"ippool"},"spec":{"blocks":[{"cidr":"10.212.0.0/24"}]}}
  creationTimestamp: "2025-01-28T22:10:33Z"
  generation: 1
  name: ippool
  resourceVersion: "2298962"
  uid: 20feab24-7806-4347-a1fd-006c3c4d3e15
spec:
  blocks:
  - cidr: 10.212.0.0/24
  disabled: false
EOF
```

Create a `CiliumBGPClusterConfig` so that the worker nodes peer with the BGP, and label all the worker nodes that should (I realise that I should select all nodes).

```
cat << EOF | kubectl create -f -
apiVersion: cilium.io/v2alpha1
kind: CiliumBGPClusterConfig
metadata:
  name: cilium-bgp
spec:
  bgpInstances:
  - localASN: 64709
    name: instance-64709
    peers:
    - name: peer-64706
      peerASN: 64706
      peerAddress: 10.127.0.60
      peerConfigRef:
        group: cilium.io
        kind: CiliumBGPPeerConfig
        name: cilium-peer
  nodeSelector:
    matchLabels:
      bgp: worker
    matchExpressions:
    - key: somekey
      operator: NotIn
      values:
      - never-used-value
EOF
```

Then create the `CiliumBGPAdvertisement`. What this does, is that it announces the `ClusterIP`, `ExternalIP`, `LoadBalancerIP` and also (very important, although I believe that the aggregator flag in `kube-apiserver` would/could mitigate that, is the `PodCIDR` so that the admission-controllers know how to reach the data plane workload.

```
cat << EOF | kubectl create -f -
apiVersion: v1
items:
- apiVersion: cilium.io/v2alpha1
  kind: CiliumBGPAdvertisement
  metadata:
    labels:
      advertise: bgp
    name: bgp-advertisements
  spec:
    advertisements:
    - advertisementType: Service
      selector:
        matchExpressions:
        - key: somekey
          operator: NotIn
          values:
          - never-used-value
      service:
        addresses:
        - ClusterIP
        - ExternalIP
        - LoadBalancerIP
    - advertisementType: PodCIDR
      attributes:
        communities:
          standard:
          - 65000:99
        localPreference: 99
kind: List
EOF
```

If everything communicates as planned, the `cilium bgp peer` should show something like this:

```
kubectl exec -n kube-system -it ds/cilium -- cilium bgp peers
Defaulted container "cilium-agent" out of: cilium-agent, config (init), mount-cgroup (init), apply-sysctl-overwrites (init), mount-bpf-fs (init), clean-cilium-state (init), install-cni-binaries (init)
Local AS   Peer AS   Peer Address      Session       Uptime     Family         Received   Advertised
64709      64706     10.127.0.60:179   established   4h41m41s   ipv4/unicast   20         20
```

---

…and to answer the title, certainly yes!

This is work in progress, but this year I’m on a mission to explore the upper layers of the Kubernetes landscape (but I do want to expand my knowledge in eBPF as well!).
