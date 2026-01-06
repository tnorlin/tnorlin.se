---
title: Cilium Hubble dynamically exported Flows
description: "With dynamically exported Flows, Cilium users can send the Hubble Flowlogs to Alertmanager and act on denied traffic"
pubDatetime: 2026-01-06T12:11:45.000Z
featured: true
category: tech
draft: false
tags: [Cilium, Hubble, Kubernetes, Grafana, Prometheus, homelab]
---

Most of the Cilium users have probably tried the Hubble UI and appreciated the visuals, together with table of flows:
![Example of denied (dropped) traffic in Hubble UI.](/assets/hubble-ui-denied.png)_Example of denied (dropped) traffic in Hubble UI._

As good as the Hubble UI is for overview and painting relations between endpoints, the `hubble` cli command is often a better choice for troubleshooting and auditing, as it allows for filtering and storing the output of flows. A similar example below:

```shell
$ kubectl port-forward -n kube-system svc/hubble-relay 4245:80 &
[1] 48352
$ hubble observe  --verdict=DROPPED -n suspicious --first 5
Handling connection for 4245
Jan  5 22:38:03.973: suspicious/escape:33160 (ID:7187) <> disney.com:80 (ID:16777218) policy-verdict:none EGRESS DENIED (TCP Flags: SYN)
Jan  5 22:38:03.973: suspicious/escape:33160 (ID:7187) <> disney.com:80 (ID:16777218) Policy denied DROPPED (TCP Flags: SYN)
Jan  5 22:38:04.995: suspicious/escape:33160 (ID:7187) <> disney.com:80 (ID:16777218) policy-verdict:none EGRESS DENIED (TCP Flags: SYN)
Jan  5 22:38:04.996: suspicious/escape:33160 (ID:7187) <> disney.com:80 (ID:16777218) Policy denied DROPPED (TCP Flags: SYN)
Jan  5 22:38:05.499: suspicious/escape:33160 (ID:7187) <> disney.com:80 (ID:16777218) policy-verdict:none EGRESS DENIED (TCP Flags: SYN)
```

Some of you collects the prometheus metrics and make valuable conclusions and paint dashboards in Grafana with the information. But did you know that you can also export the Hubble Flowlogs to be consumed later?

### Hubble Flow Exporter to the rescue

With the [Hubble Exporter](https://docs.cilium.io/en/latest/observability/hubble/configuration/export/), you can export the flows either to the file system or as standard output (stdout). This exporter is a feature of the cilium-agent and it is not enabled by default, but can easily be enabled by providing a couple of helm flags and configuring a ConfigMap. In the basic configuration, the Hubble Exporter is enabled and configured statically by setting the `hubble.export.static.enabled=true` and `hubble.export.static.FilePath=/path/to/logfile`. The static exporter requires the cilium-agent to be restarted upon reconfiguration and is limited to one filter set.

With a dynamic Hubble exporter, changes don't require restart of cilium-agent (except for the first time, when installing the exporter) and allows for multiple filter sets to be configured. Configuration can be done by enabling the dynamic exporter with a helm flag `hubble.export.dynamic.enabled=true` and creating a ConfigMap, either in advance, or directly with helm flags populating the ConfigMap.

Sample configuration below that will generate output to stdout whenever traffic flow is egress and event_type is 1 (DROPPED):

```yaml
apiVersion: v1
data:
  flowlogs.yaml: |
    flowLogs:
    - excludeFilters: []
      fieldMask: []
      filePath: /dev/stdout
      includeFilters:
      - event_type:
       - type: 1
        traffic_direction:
        - EGRESS
      name: hubble-flowlog
kind: ConfigMap
metadata:
  name: cilium-flowlog-config
  namespace: kube-system
```

To enable the dynamic exporter and use the above configuration. Restart the cilium-agent to apply the new settings (if you haven't already provisioned Cilium with `rollOutCiliumPods=true` in order to reload new pods during ConfigMap changes):

```yaml
hubble:
  enabled: true
  export:
    dynamic:
      enabled: true
      config:
        configMapName: cilium-flowlog-config
        createConfigMap: false
```

So how about sending Hubble flow logs to Grafana Loki (or whatever your log destination might be)? If the log agent fetches the stdout from the logs, this will happen automatically:

![Dropped flow that was exported by Hubble through the cilium-agent.](/assets/loki-hubble-flows.png)_Dropped flow that was exported by Hubble through the cilium-agent._

This allows for creating neat dashboards or to capture the flow with Alert Manager and send out an alert whenever something unaccepted happens. Endless possibilies lies ahead!

### Hubble Metrics Exporter

Talking about metrics, Hubble can be configured with either a static or a dynamic metrics exporter. The Hubble metrics dynamic exporter, as in the case of flow logs, allows for reconfiguring the metrics as needed without a required agent restart. Visibility and observability unfortunately is not all good, but a compromise between insights and performance. If certain metrics affect overall performance, it is really neat that Cilium allows one to just turn it off on the fly!
The dynamic metrics exporter, similar to the flow logs exporter, needs a configuration and helm flags in order to be active.
A sample ConfigMap that exports metrics for various traffic types:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: cilium-dynamic-metrics-config
  namespace: kube-system
data:
  dynamic-metrics.yaml: |
    metrics:
      - name: dns
      - contextOptions:
        - name: sourceContext
          values:
          - workload-name
          - reserved-identity
        - name: destinationContext
          values:
          - workload-name
          - reserved-identity
        name: flow
      - name: drop
      - name: tcp
      - contextOptions:
        - name: sourceContext
          values:
          - workload-name
          - reserved-identity
        name: icmp
      - contextOptions:
        - name: exemplars
          values:
          - true
        - name: labelsContext
          values:
          - source_ip
          - source_namespace
          - source_workload
          - destination_ip
          - destination_namespace
          - destination_workload
          - traffic_direction
        - name: sourceContext
          values:
          - workload-name
          - reserved-identity
        - name: destinationContext
          values:
          - workload-name
          - reserved-identity
        name: httpV2
      - contextOptions:
        - name: sourceContext
          values:
          - app
          - workload-name
          - pod
          - reserved-identity
        - name: destinationContext
          values:
          - app
          - workload-name
          - pod
          - dns
          - reserved-identity
        - name: labelsContext
          values:
          - source_namespace
          - destination_namespace
        excludeFilters:
        - destination_pod:
          - default/
        name: policy
      - contextOptions:
        - name: labelsContext
          values:
          - source_namespace
          - source_workload
          - destination_namespace
          - destination_workload
          - traffic_direction
        - name: sourceContext
          values:
          - workload-name
          - reserved-identity
        - name: destinationContext
          values:
          - workload-name
          - reserved-identity
        name: kafka
```

A reference of available metrics here: https://docs.cilium.io/en/latest/observability/metrics/#metrics-reference

To enable the export, set the relevant helm flags, such as `hubble.metrics.enabled=[]`, `hubble.metrics.dynamic.enabled=true`, `hubble.metrics.dynamic.config.configMapName=cilium-dynamic-metrics-config`, `hubble.metrics.dynamic.config.createConfigMap=false`.
Most probably you will want to have `prometheus.enabled=true` and `operator.prometheus.enabled=true` as well to capture metrics for cilium-agent and the cilium-operator. The above ConfigMap requires OpenMetrics (`hubble.metrics.enableOpenMetrics=true` to be enabled as well for the httpV2). Complete helm command below:

```bash
helm upgrade cilium cilium/cilium --reuse-values \
  --namespace kube-system \
  --set prometheus.enabled=true \
  --set operator.prometheus.enabled=true \
  --set hubble.enabled=true \
  --set hubble.metrics.enableOpenMetrics=true \
  --set hubble.metrics.enabled=[] \
  --set hubble.metrics.dynamic.enabled=true \
  --set hubble.metrics.dynamic.config.configMapName=cilium-dynamic-metrics-config \
  --set hubble.metrics.dynamic.config.createConfigMap=false
```

Some of the metrics in Grafana:

![Captured Flows in Grafana.](/assets/grafana-hubble-metrics.png)_Captured Flows in Grafana._

Now, how about that?
