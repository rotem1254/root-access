# Phase 2 — Plan (Networking & Lateral Movement)

Proceeding under the user's explicit delegation ("continue as you think best, highest quality").
Same working agreement as Phase 1: small verifiable steps, Conventional Commits, the quality gate
(`typecheck` + `lint` + `test`) green after every step, no plaintext flags in the build.

## Goal

A simulated network layer — hosts with IP addresses, open ports and services, and reachability
rules — plus the commands to explore it and `ssh` between machines, and Chapter 2 "Lateral Movement"
(four levels) that teach real network-reconnaissance and pivoting skills.

Everything stays simulated: no real sockets, DNS or HTTP (the CSP already blocks the network). Only
reserved addresses (RFC 5737 / RFC 1918) and `.internal` / `.example` domains.

## Architecture additions

```
src/engine/network/
  types.ts        Service, PortState, HostNetwork, packet-capture summary types
  Network.ts      a set of Machines with IPs; DNS (.internal), reachability, port lookup
  services.ts     built-in service banners/behaviour (ssh, http, ftp, smtp, dns, ...)
  http.ts         a tiny simulated HTTP responder (status line, headers, body) for curl/wget/nc
```

- **`Level.hosts`** (new, optional): `HostDefinition[]` describing extra machines. Each host gets an
  `ip`, `mac?`, and `ports` (port → service). `Level.network?` sets subnet/reachability and DNS.
  Backwards compatible: a level with no `hosts` is a single-machine level as today.
- **Multi-machine shell.** `Session` gains `machine`. The Shell derives the current machine from the
  session; the Executor uses `session.machine` throughout (today it reads a single host machine).
  `ssh` pushes a session on another machine; `exit`/Ctrl-D pops back, like `su` across hosts.
- **Reachability** is decided by the `Network` from the *current* host, so firewalled segments make
  lateral movement meaningful (you must land on host B to reach host C).

## Steps

1. **Network model** — `Network`, `Service`, host network metadata, DNS, reachability, port scan
   results. Pure, unit-tested. Extend `HostDefinition`/`Level` with `ip`/`ports`/`network`.
2. **Multi-machine refactor** — thread `session.machine` through the Executor and Shell; `ssh`
   session push/pop across machines; snapshot/restore includes the host stack. Keep `su` and all
   Phase 1 tests green.
3. **Recon commands** — `ifconfig` / `ip a`, `hostname -I`, `ping`, `nmap` (`-p`, `-sV`, default top
   ports), `netstat` / `ss` (`-tlnp`). Man pages + `--help` + tests.
4. **Connectivity commands** — `ssh` (auth + hop, `-i` ignored gracefully), `scp`-style copy note,
   `dig` / `nslookup`, `nc` (banner grab / send line), `curl` and `wget` against the simulated HTTP
   responder, `tcpdump -r` / reading a `.pcap` summary file.
5. **Chapter 2 content** — four "Lateral Movement" levels, each with `solution.ts`, solvability and
   anti-shortcut tests; replace the four Chapter 2 stubs.
6. **Wrap-up** — README (new commands + how to add a networked level), full Definition-of-Done pass,
   Phase 2 report.

## Chapter 2 — Lateral Movement (draft)

1. **First Contact** — you land on a jump host. `ip a` / `ifconfig` to learn your subnet, `ping` the
   gateway, `nmap` the local range to discover hosts. Flag: identify the internal server (teaches
   interface reading, ping sweep, host discovery).
2. **Open Ports** — `nmap -sV` a discovered host, find an unusual open service, grab its banner with
   `nc` (or `curl` an HTTP port). The banner/page holds the flag (teaches service/version scanning,
   banner grabbing).
3. **Hop the Fence** — credentials recovered in level 2 let you `ssh` from the jump host to an
   internal host you could not reach directly; the flag lives there and only there (teaches ssh
   pivoting and network segmentation).
4. **Packet Trail** — a `.pcap` on the internal host holds captured traffic; `tcpdump -r` summarises
   it, revealing a credential/token in a cleartext request. Use it to reach the last service and read
   the flag (teaches reading captures and cleartext-protocol risk).

## Fidelity conventions (new)

- `nmap` output matches the familiar layout: `Starting Nmap 7.94 ...`, `Nmap scan report for host
  (ip)`, `PORT STATE SERVICE [VERSION]`, `Host is up (0.00030s latency).`, closing summary line.
- `ping` prints `64 bytes from host (ip): icmp_seq=1 ttl=64 time=0.033 ms` and a statistics block;
  unreachable hosts time out with the real wording and exit 1.
- `ssh` first-connection host-key prompt (`The authenticity of host ... yes/no`), then a password
  prompt; wrong host → `ssh: connect to host x port 22: Connection refused` / `No route to host`.
- `curl` shows the body by default; `-I` headers; `-v` the request/response trace. `wget` writes a
  file and prints its progress summary.
- Addresses: gateway `10.10.0.1`, hosts in `10.10.0.0/24` and a segmented `10.10.9.0/24`; documentation
  ranges for anything "external". Hostnames under `.novacorp.internal`.
```
