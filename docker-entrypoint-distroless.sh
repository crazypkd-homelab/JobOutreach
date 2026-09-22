#!/busybox/sh
set -e

# /data is a bind mount that Docker may create as root. Hand it to the unprivileged
# user, then switch to that user so files written on the host are editable by the owner.
/busybox/mkdir -p /data
/busybox/chown -R nonroot:nonroot /data 2>/dev/null || true

exec /busybox/su nonroot -s /busybox/sh -c 'exec "$0" "$@"' "$@"
