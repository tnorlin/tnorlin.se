---
title: kubectl oneliners
author: Tony Norlin
description: "Some useful kubectl commands."
pubDatetime: 2023-09-08T14:13:51.279Z
draft: false
---

# Handy kubectl commands

## Patch container in a running Pod.

    # Set parameters
    # Pod Name
    PNAME=alertmanager-prometheus-k8s-alertmanager-0
    # Container Name
    CNAME=alertmanager
    # Container Image Name
    CIMAGE=alertmanager
    # Container Image Version
    CVER=v0.25.1

    # Get current image version (and state)
    $ kubectl get pods -n monitoring ${PNAME} -o=jsonpath="{.spec.containers[?(@.name==\"${CNAME}\")].image}{\"|\"}{.status.containerStatuses[?(@.name==\"${CNAME}\")].state}"; echo
    ---
    quay.io/prometheus/alertmanager:v0.24.0|{"running":{"startedAt":"2023-09-08T15:35:47Z"}}

    # Patch container with new image version.
    $ kubectl -n monitoring patch pod ${PNAME} -p "{\"spec\":{\"containers\":[{\"name\": \"${CNAME}\", \"image\": \"${CIMAGE}:${CVER}\"}]}}"
    ---
    pod/alertmanager-prometheus-k8s-alertmanager-0 patched

    # Get the new container image version.
    $ kubectl get pods -n monitoring ${PNAME} -o=jsonpath="{.spec.containers[?(@.name==\"${CNAME}\")].image}{\"|\"}{.status.containerStatuses[?(@.name==\"${CNAME}\")].state}"; echo
    ---
    alertmanager:v0.24.1|{"waiting":{"message":"Back-off pulling image \"alertmanager:v0.25.1\"","reason":"ImagePullBackOff"}}

    # Get current pod state
    $ kubectl -n monitoring get pod alertmanager-prometheus-k8s-alertmanager-0
    ---
    NAME                                         READY   STATUS         RESTARTS      AGE
    alertmanager-prometheus-k8s-alertmanager-0   1/2     ErrImagePull   1 (75s ago)   4m26skubectl get pods -n monitoring ${PNAME} -o=jsonpath="{.spec.containers[?(@.name==\"${CNAME}\")].image}{\"|\"}{.status.containerStatuses[?(@.name==\"${CNAME}\")].state}"; echo
    alertmanager:v0.24.1|{"waiting":{"message":"Back-off pulling image \"alertmanager:v0.25.1\"","reason":"ImagePullBackOff"}}
