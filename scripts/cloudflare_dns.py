#!/usr/bin/env python3
"""Manage only the hackathon hostname and ACM validation records in Cloudflare."""
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from validate_repo import CONFIG

ZONE_NAME = CONFIG["cloudflare_zone"]
SITE_NAME = CONFIG["site_domain"]
API = "https://api.cloudflare.com/client/v4"


def request(method, path, payload=None):
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "")
    if not token:
        raise RuntimeError("Set CLOUDFLARE_API_TOKEN as a protected GitHub Actions environment secret")
    body = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        API + path,
        data=body,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        detail = error.read().decode(errors="replace")
        raise RuntimeError(f"Cloudflare API returned HTTP {error.code}: {detail[:500]}") from error
    if not result.get("success"):
        raise RuntimeError(f"Cloudflare API request failed: {json.dumps(result.get('errors', []))[:500]}")
    return result.get("result")


def zone_id():
    zones = request("GET", "/zones?" + urllib.parse.urlencode({"name": ZONE_NAME, "status": "active"}))
    exact = [zone for zone in zones if zone.get("name") == ZONE_NAME and zone.get("status") == "active"]
    if len(exact) != 1:
        raise RuntimeError(f"Expected one active Cloudflare zone named {ZONE_NAME}")
    return exact[0]["id"]


def records(zone, name):
    query = urllib.parse.urlencode({"name": name, "per_page": 100})
    return request("GET", f"/zones/{zone}/dns_records?{query}")


def ensure_cname(name, target):
    zone = zone_id()
    matches = records(zone, name)
    conflicts = [record for record in matches if record.get("type") != "CNAME"]
    if conflicts:
        raise RuntimeError(f"Refusing to overwrite non-CNAME DNS records at {name}")
    if len(matches) > 1:
        raise RuntimeError(f"Refusing to modify ambiguous DNS records at {name}")
    payload = {
        "type": "CNAME", "name": name, "content": target.rstrip("."),
        "ttl": 1, "proxied": False, "comment": "Managed by codelinq-hackathon IaC",
    }
    if matches:
        existing = matches[0]
        if existing.get("content", "").rstrip(".") != target.rstrip("."):
            raise RuntimeError(f"Refusing to replace an existing {name} CNAME with a different target")
        if existing.get("proxied") is False and existing.get("ttl") == 1:
            return
        request("PUT", f"/zones/{zone}/dns_records/{existing['id']}", payload)
    else:
        request("POST", f"/zones/{zone}/dns_records", payload)


def delete_owned_cname(name, target):
    zone = zone_id()
    matches = records(zone, name)
    for record in matches:
        if record.get("type") != "CNAME":
            raise RuntimeError(f"Refusing to remove non-CNAME DNS records at {name}")
        if record.get("content", "").rstrip(".") != target.rstrip("."):
            raise RuntimeError(f"Refusing to remove {name}; it no longer points to this hackathon target")
        request("DELETE", f"/zones/{zone}/dns_records/{record['id']}")


def ensure_acm_validation(record):
    ensure_cname(record["Name"].rstrip("."), record["Value"].rstrip("."))


def delete_acm_validation(record):
    delete_owned_cname(record["Name"].rstrip("."), record["Value"].rstrip("."))
