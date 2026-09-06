#!/usr/bin/env sh
set -eu
# Run as a server administrator after DNS points hmrc-gateway.work-rate.uk at a London reserved IP.
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
install -m 0644 hmrc-gateway.service /etc/systemd/system/hmrc-gateway.service
systemctl daemon-reload
systemctl enable --now hmrc-gateway