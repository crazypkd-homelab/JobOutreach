#!/bin/sh
set -e

# /data is a bind mount that Docker may create as root. Hand it to the unprivileged
# user, then drop privileges so files written on the host are editable by the owner.
mkdir -p /data
find /data -not -user pwuser -exec chown pwuser:pwuser {} + 2>/dev/null || true

exec setpriv --reuid=pwuser --regid=pwuser --init-groups "$@"
