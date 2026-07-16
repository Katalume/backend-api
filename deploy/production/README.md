# Dedicated execution deployment (future upgrade)

This profile requires paid compute and is intentionally not used by the
zero-cost public beta. See [`../free-beta`](../free-beta/README.md) for the
current launch profile.

This deployment keeps the public API and evaluation worker together on one
small application host while isolating privileged Judge0 execution on a second
host in the same private VPC.

## Topology

- `api.katalume.com` points to the API host's fixed public IPv4 address.
- Caddy terminates TLS and is the only service publishing public ports.
- The API and durable evaluation worker use managed MongoDB and Redis over TLS.
- The worker reaches Judge0 on the Judge0 host's private VPC address.
- Judge0 port `2358` is never published on the public interface.

## Network policy

API host firewall:

- allow TCP `22` only from the owner's administration IP;
- allow TCP `80` and TCP/UDP `443` from the internet;
- deny every other inbound port.

Judge0 host firewall:

- allow TCP `22` only from the owner's administration IP;
- allow TCP `2358` only from the API host's private VPC IPv4 address;
- deny every other inbound port.

MongoDB Atlas must allow only the API host's fixed public IPv4 address. Do not
use `0.0.0.0/0` for the production database.

## API host

1. Install Docker Engine and the Compose plugin from Docker's official Ubuntu
   repository.
2. Clone this repository and check out the audited production commit.
3. Copy `deploy/production/api.env.example` to
   `deploy/production/api.env`, fill the secret values, and set mode `0600`.
4. Set `JUDGE0_URL` to the Judge0 host's private VPC URL.
5. From the repository root, validate and start the stack:

   ```sh
   KATALUME_ENV_FILE=api.env docker compose \
     --env-file deploy/production/api.env \
     -f deploy/production/docker-compose.yml config
   KATALUME_ENV_FILE=api.env docker compose \
     --env-file deploy/production/api.env \
     -f deploy/production/docker-compose.yml up -d --build
   ```

6. Verify `https://api.katalume.com/health` and `/ready` before enabling the
   frontend's live mode.

## Judge0 host

1. Install Docker Engine and the Compose plugin.
2. Copy `judge0/judge0-v1.13.1` to the host.
3. Set strong, unique values in `judge0.conf` for `AUTHN_HEADER`,
   `AUTHN_TOKEN`, `REDIS_PASSWORD`, and `POSTGRES_PASSWORD`.
4. Set `JUDGE0_BIND_ADDRESS` to the host's private VPC IPv4 address.
5. Start Judge0 with the configuration as the Compose environment source:

   ```sh
   docker compose --env-file judge0.conf config
   docker compose --env-file judge0.conf up -d
   ```

6. From the API host, call `/system_info` with the configured authentication
   header. Confirm the same request cannot reach port `2358` over the Judge0
   host's public address.

## Release order

1. Run database migrations and seed only reviewed launch content.
2. Start Judge0, then the API and worker.
3. Verify health, readiness, authentication, and real execution privately.
4. Configure Vercel live-only variables and deploy the frontend.
5. Run the production smoke journey and retain the evidence before admitting
   users.
