---
title: From ingress-nginx to Gateway API (with Cilium)
author: Tony Norlin
description: Migration from ingress-nginx to Gateway API with a shared gateway (with Cilium).
featured: true
pubDatetime: 2025-02-23T20:05:15.922Z
draft: false
tags:
  - kubernetes
  - networking
  - cilium
  - homelab
  - gateway api
  - ingress-nginx
keywords:
  - cilium
  - gateway api
  - kubernetes
  - networking
  - homelab
---

The ingress-nginx ingress controller served many kubernetes installations for a good reason and the sheer amount of annotations and configmap settings made ingress-nginx a very complete implementation, but it should not come as a surprise to anyone that the project decided to deprecate the implementation. In fact, the project announced about the issues a couple of times throughout the years.
Back in June 2022(!), one of the maintainers announced about [code freeze and stabilisation](https://groups.google.com/a/kubernetes.io/g/dev/c/rxtrKvT_Q8E):

> And with new features, there are new bugs. One of the feelings we've got since we started maintaining Ingress is that usually, one or two users need a new feature, and they implement it (thanks for the PR!!), but when a bug happens, no one steps forward to fix it.
>
> This lack of support becomes a burden to Ingress NGINX maintainers: we now have to split our time between issues, bug fixing, new feature reviews, and the bugs that may arise from this feature. We do this in our spare time, and it's becoming hard for us to keep this pace.
>
> There is this feeling that we probably support too many features. Some (a lot) of them are external to NGINX, and this turns out to need a complex build process, with modules that are sometimes not supported anymore and our slowing down the core evolution.

Earlier this year the project announced that it was the [end of the road](https://github.com/kubernetes/ingress-nginx/issues/13002) for ingress-nginx:

> Once a stable release of InGate is available we will officially put the project in [maintenance mode](https://github.com/kubernetes/community/blob/master/github-management/kubernetes-repositories.md#maintenance-mode).

InGate never happened, as the community did not show up. As one of the many users of ingress-nginx, I’m grateful that Marco, James and Ricardo kept going on for so long.

#### Choosing a Gateway API implementation

There are many great and interesting [implementations](https://gateway-api.sigs.k8s.io/implementations/) of Gateway API, many of them (but not all) based on envoy. Ingress objects were perhaps released a bit ahead of their time?

[https://kubernetes.io/blog/2020/08/26/kubernetes-release-1.19-accentuate-the-paw-sitive/#ingress-graduates-to-general-availability]:

> #### Ingress graduates to General Availability
>
> In terms of moving the Ingress API towards GA, the API itself has been available in beta for so long that it has attained de facto GA status through usage and adoption (both by users and by load balancer / ingress controller providers). Abandoning it without a full replacement is not a viable approach. It is clearly a useful API and captures a non-trivial set of use cases. At this point, it seems more prudent to declare the current API as something the community will support as a V1, codifying its status, while working on either a V2 Ingress API or an entirely different API with a superset of features.

Back in 2015, with [Kubernetes v1.1.1](https://github.com/kubernetes/kubernetes/blob/v1.1.1/docs/user-guide/ingress.yaml) I see the Ingress being mentioned in the user guide for the first time, and the first commits into the ingress-nginx project looks like they happened in the beginning of 2016, be well before common usage patterns defining a service mesh (Istio project started in 2017). As such, there were not that many [rules to conform with](https://github.com/kubernetes-sigs/ingress-controller-conformance/tree/master) and the various implementations could rather freely extend in a way that suited the implementation.

Fast forward a couple of years. Sig-network, responsible for Gateway API, have worked hard on conformance and [defined a set of features](https://gateway-api.sigs.k8s.io/implementations/v1.4/) that each implementation should support, in order to be conformant against the specification. Portability is one of the [design goals](https://gateway-api.sigs.k8s.io/#gateway-api-concepts). Among the things that separates Gateway API from Ingress Controllers, is the role-oriented design.

There are many implementations of Gateway API, but as I’m already using the Cilium and it’s integrated implementation of Gateway API since more than two years (https://medium.com/@norlin.t/installing-cilium-service-mesh-with-external-kubernetes-control-plane-illumos-e5517253e011?source=friends_link&sk=c2f0e8dc4ec5cc2d17aa66dfc36b62a5 ), it feels like a natural and undramatic choice for me.

#### Endless possibilities with Cilium

In my design, I use an external control plane, running illumos (the continuation of OpenSolaris, the open-source release of Solaris operating system, which got killed by Oracle). The data plane on the other hand is running in another network segment than the control plane (which in turn is segmented into a network for etcd, and another for scheduler and controller-manager, with kube-apiserver as the frontend). I use BGP in my network to a fairly large extent and in my cluster I do route both PodCIDR and ClusterIP, however it is not announced/routable other than to the control plane. This is one of the many things possible, thanks to the extensive functionality of Cilium.

As a side note, IMHO I would like to see a kube-admission-controller in Kubernetes. A controller living as an extension in the control plane, instead of the current architecture with the dynamic admission controller running in the data plane and creates a bit of an anti pattern. Currently, with a admission controller like Kyverno, the kube-apiserver needs ask the worker node(!) in order to validate if a call should be accepted or not.

In my home network, I have control over several subnets and I usually let each exposed resource connect to its own gateway with a unique IP (and then I announce it with BGP and let external-dns talk to my internal DNS, with a DNS-01 challenge over RFC-2136 method, to let the clients resolve the domain name). This is something that, at least with IPv4, will not be feasible with an Internet exposed cluster, as public IP has become a scarce resource.

### Setting up Gateway API

#### Exposing a NodePort

With ingress-nginx, a common pattern is to expose the cluster with an external load balancer (such as HAProxy, NGINX, Traefik) serving a frontend on port TCP/443 and TCP/80 and then talking to the ingress-nginx on a predefined NodePort.

The same pattern is applicable with the Cilium Gateway API (well, sort of) — a shared gateway controller with cross-namespace routing.

Become a member
During installation/configuration of Cilium, there’s an option to allow the envoy agent to listen on hostNetwork. Helm values as follows:

    gatewayAPI:
      enabled: true
      hostNetwork:
        enabled: true

As the official documentation states:

> Once enabled, the host network port for a Gateway can be specified via spec.listeners.port. The port must be unique per Gateway resource and you should choose a port number higher than 1023 (see [Bind to privileged port](https://docs.cilium.io/en/latest/network/servicemesh/gateway-api/gateway-api/#bind-to-privileged-port)).

Within one gateway, the listeners must be declared unique with hostname, port and protocol.

#### Pre v1.15 Gateway API specification

In the gateway, you can specify one port that the listener will listen for, and in the spec allows for listen on a NodePort (which defaults to a range between 30000–32767) and with that you can refer the your external load balancer.

In this example, we are using Cert Manager to issue a certificate to the Gateway resource (with Ingress Controller, the certificate was instead issued to the Ingress object). With the allowedRoutes we control which namespaces that are allowed to use the listener. In this case we do not restrict any namespace.

    apiVersion: gateway.networking.k8s.io/v1
    kind: Gateway
    metadata:
      annotations:
        cert-manager.io/cluster-issuer: letsencrypt-prod
      name: gateway
      namespace: gateway
    spec:
      gatewayClassName: cilium
      listeners:
      - allowedRoutes:
          namespaces:
            from: All
        hostname: gateway.kubernaut.eu
        name: https
        port: 30011
        protocol: HTTPS
        tls:
          certificateRefs:
          - group: ""
            kind: Secret
            name: gateway-tls-secret
          mode: Terminate
      - allowedRoutes:
          namespaces:
            from: All
        hostname: gateway.kubernaut.eu
        name: http
        port: 30012
        protocol: HTTP

Then in the namespace where traffic should reach, we create a HTTPRoute to point to the Service. In this example we reach the grafana service by browsing to gateway.kubernaut.eu/grafana. A requestDirect makes sure that access to the path /grafana on port 80 will receive a HTTP error 302 and redirect to the same path at port 443.

    apiVersion: gateway.networking.k8s.io/v1
    kind: HTTPRoute
    metadata:
      name: grafana
      namespace: grafana
    spec:
      hostnames:
      - gateway.kubernaut.eu
      parentRefs:
      - group: gateway.networking.k8s.io
        kind: Gateway
        name: gateway
        namespace: gateway
      rules:
      - filters:
        - requestRedirect:
            port: 443
            scheme: https
            statusCode: 302
          type: RequestRedirect
        matches:
        - path:
            type: PathPrefix
            value: /grafana
      - backendRefs:
        - group: ""
          kind: Service
          name: grafana
          port: 80
          weight: 1
        filters:
        - type: URLRewrite
          urlRewrite:
            path:
              replacePrefixMatch: /
              type: ReplacePrefixMatch
        matches:
        - path:
            type: PathPrefix
            value: /grafana

#### Cert Manager (pre v1.15 Gateway API)

Cert manager needs to be deployed with the following helm values in order to observe HTTPRoutes

    config:
      apiVersion: controller.config.cert-manager.io/v1alpha1
      enableGatewayAPI: true
      kind: ControllerConfiguration

Then, the ClusterIssuer (or Issuer) that handles ACME validation, needs to be updated to reflect the solver. In this example I show two solvers, but in most cases there would only be a single solver. As you can see, the DNS-01 remains unaffected:

    apiVersion: cert-manager.io/v1
    kind: ClusterIssuer
    metadata:
      name: letsencrypt-prod
    spec:
      acme:
        email: some-email-here@please
        privateKeySecretRef:
          name: letsencrypt-prod
        server: https://acme-v02.api.letsencrypt.org/directory
        solvers:
        - http01:
            gatewayHTTPRoute:
              parentRefs:
              - group: gateway.networking.k8s.io
                kind: Gateway
                name: gateway
                namespace: gateway
          selector:
            dnsNames:
            - gateway.kubernaut.eu
        - dns01:
            cloudflare:
              apiTokenSecretRef:
                key: api-token
                name: cloudflare-api-token-secret
          selector:
            dnsNames:
            - www.example.com

#### ListenerSets (Gateway API v1.15?)

In the case of shared gateways, current model has some limitation in that the gateway admin needs to be in charge of updating the listeners (and certificates), but this is about to change.

[GEP-1713](https://gateway-api.sigs.k8s.io/geps/gep-1713/) describes a feature called ListenerSets, supposedly to become stable in v1.15 during early 2026. With ListenerSet, listeners instead can be defined in the affected namespace (much like the Ingress objects used to be).

It also enables Cert Manager to issue the certificates on a per namespace basis instead and the feature is planned to be implemented in the upcoming v1.20 release of Cert Manager. This [issue](https://github.com/cert-manager/cert-manager/issues/8251) is tracking the implementation.

With current specification, the maximum amount of listeners per gateway is 64, but with ListenerSets instead this limit is supposed to be 64 listeners per ListenerSet (so with some ingenuity and creativity the limit of 64 no longer applies).

Sample definition from the GEP-1713:

    apiVersion: gateway.networking.k8s.io/v1
    kind: Gateway
    metadata:
      name: parent-gateway
    spec:
      gatewayClassName: example
      allowedListeners:
        namespaces:
          from: Same
      listeners:
      - name: foo2
        hostname: foo.com
        protocol: HTTP
        port: 80
      - name: foo3
        hostname: foo1.com
        protocol: HTTP
        port: 80
    ---
    apiVersion: gateway.networking.x-k8s.io/v1alpha1
    kind: XListenerSet
    metadata:
      name: first-workload-listeners
    spec:
      parentRef:
        name: parent-gateway
        kind: Gateway
        group: gateway.networking.k8s.io
      listeners:
      - name: foo
        hostname: first.foo.com
        protocol: HTTP
        port: 80

As you can se, the ListenerSet refers to a specified listener in a gateway. There’s lots of activity in the projects git repository, both with commits and design proposals, and this is a good opportunity (if you have the time and knowledge) to help the community. Just look at their [GitHub project page](https://github.com/kubernetes-sigs/gateway-api/issues).

Exciting times ahead!
