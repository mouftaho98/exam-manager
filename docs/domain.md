# Domain and HTTPS

We use a free `.tech` domain from the [GitHub Student Developer Pack](https://education.github.com/pack). It's free for the first year, which covers the course. Renewing after that costs money, so let it lapse or move it after the course.

## 1. Claim the domain (one of us, in a browser)

1. Get the Student Developer Pack at https://education.github.com/pack. Sign in with GitHub and verify with a `@mail.utoronto.ca` email. Approval can take from a few minutes to a few days.
2. On the pack page, open the **.TECH Domains** offer and sign in to get.tech with GitHub.
3. Search for a name, e.g. `rollcall.tech` or `rollcall-exams.tech`, and claim it for 1 year. Free claims only cover standard (non-premium) names.

## 2. Point it at the cluster

Easiest is to let DigitalOcean manage DNS, next to the cluster:

1. In the get.tech control panel, set the domain's name servers to `ns1.digitalocean.com`, `ns2.digitalocean.com` and `ns3.digitalocean.com`.
2. In DigitalOcean, open **Networking → Domains → Add domain** and enter the domain.
3. Add `A` records:

   | Host | Points to |
   |---|---|
   | `@` | `146.190.191.196` (web load balancer) |
   | `api` | `209.38.1.216` (API load balancer) |

DNS usually takes minutes to update, but it can take up to a day. Check it with `dig +short rollcall.tech`.

## 3. Tell the apps their new address

- **Web image:** rebuild with `VITE_API_URL=https://api.<domain>`. It's baked in at build time.
- **API:** set `WEB_URL=https://<domain>` (invite links use it) and `CORS_ORIGIN=https://<domain>`.

## 4. HTTPS

Phone cameras only open over HTTPS, so ID card scanning on phones needs this step. Install ingress-nginx and cert-manager, add a Let's Encrypt `ClusterIssuer`, and create one Ingress for the domain:
- `<domain>` goes to the web Service.
- `api.<domain>` goes to the API Service, with WebSocket support for Socket.IO.

The Ingress gets its own load balancer, so the two existing `LoadBalancer` Services can become `ClusterIP`, which saves the cost of one load balancer.
