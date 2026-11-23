# Domain and HTTPS

## Fastest: DuckDNS (free, no approval, about 5 minutes)

**In use now:** `uoft-rollcall.duckdns.org` (web) and `uoft-rollcall-api.duckdns.org` (API). The steps below are how they were set up.

1. Go to https://www.duckdns.org and sign in with any of the accounts it offers (GitHub, Google, …).
2. Add two subdomains and set each one's **current ip**:

   | Subdomain | IP |
   |---|---|
   | `uoft-rollcall` | `146.190.191.196` (web) |
   | `uoft-rollcall-api` | `209.38.1.216` (API) |

3. In GitHub (**Settings → Secrets and variables → Actions → Variables**), set `PUBLIC_WEB_URL=http://uoft-rollcall.duckdns.org` and `PUBLIC_API_URL=http://uoft-rollcall-api.duckdns.org`.
4. On the cluster, set `WEB_URL=http://uoft-rollcall.duckdns.org` and `CORS_ORIGIN=http://uoft-rollcall.duckdns.org,http://146.190.191.196` (comma-separated, no spaces) in the `api-credentials` Secret, then run `kubectl -n exam-manager rollout restart deployment/api`.
5. Run **Actions → Deploy → Run workflow**, which rebuilds the web app against the new API address.

DuckDNS names work with Let's Encrypt, so the HTTPS section below works the same way.

## Nicer name: a `.tech` domain

We use a free `.tech` domain from the [GitHub Student Developer Pack](https://education.github.com/pack). It's free for the first year, which covers the course. Renewing after that costs money, so let it lapse or move it after the course.

### 1. Claim the domain (one of us, in a browser)

1. Get the Student Developer Pack at https://education.github.com/pack. Sign in with GitHub and verify with a `@mail.utoronto.ca` email. Approval can take from a few minutes to a few days.
2. On the pack page, open the **.TECH Domains** offer and sign in to get.tech with GitHub.
3. Search for a name, e.g. `rollcall.tech` or `rollcall-exams.tech`, and claim it for 1 year. Free claims only cover standard (non-premium) names.

### 2. Point it at the cluster

Easiest is to let DigitalOcean manage DNS, next to the cluster:

1. In the get.tech control panel, set the domain's name servers to `ns1.digitalocean.com`, `ns2.digitalocean.com` and `ns3.digitalocean.com`.
2. In DigitalOcean, open **Networking → Domains → Add domain** and enter the domain.
3. Add `A` records:

   | Host | Points to |
   |---|---|
   | `@` | `146.190.191.196` (web load balancer) |
   | `api` | `209.38.1.216` (API load balancer) |

DNS usually takes minutes to update, but it can take up to a day. Check it with `dig +short rollcall.tech`.

### 3. Tell the apps their new address

- **Web image:** set the repository variables `PUBLIC_WEB_URL=https://<domain>` and `PUBLIC_API_URL=https://api.<domain>`, then run the Deploy workflow. It rebuilds the web app with the new API address.
- **API:** set `WEB_URL=https://<domain>` (invite links use it) and `CORS_ORIGIN=https://<domain>`.

## HTTPS

Phone cameras only open over HTTPS, so ID card scanning on phones needs this step. Install ingress-nginx and cert-manager, add a Let's Encrypt `ClusterIssuer`, and create one Ingress for the domain:
- `<domain>` goes to the web Service.
- `api.<domain>` goes to the API Service, with WebSocket support for Socket.IO.

The Ingress gets its own load balancer, so the two existing `LoadBalancer` Services can become `ClusterIP`, which saves the cost of one load balancer.
