# ZFS NAS Setup Guide

Reference for the Superbloom ZFS NAS configuration.

## Hardware

- **Drives:** 8 × Seagate IronWolf 8TB (ST8000VN0022)
- **Configuration:** RAIDZ2 (6 data + 2 parity)
- **Usable capacity:** ~43TB
- **Fault tolerance:** 2 drive failures
- **RAM:** 64GB DDR4 (ZFS ARC uses ~32GB)

## Drive IDs

```
ata-ST8000VN0022-2EL112_ZA16K42X  (sda)
ata-ST8000VN0022-2EL112_ZA177GFA  (sdb)
ata-ST8000VN0022-2EL112_ZA16KAGJ  (sdc)
ata-ST8000VN0022-2EL112_ZA12V3DZ  (sdd)
ata-ST8000VN0022-2EL112_ZA16K437  (sde)
ata-ST8000VN0022-2EL112_ZA16J24Y  (sdf)
ata-ST8000VN0022-2EL112_ZA16K819  (sdg)
ata-ST8000VN0022-2EL112_ZA167ZVK  (sdh)
```

## Pool Creation

```bash
zpool create -f \
  -o ashift=12 \
  -O compression=lz4 \
  -O atime=off \
  -O xattr=sa \
  -O acltype=posixacl \
  -O normalization=formD \
  -m /tank \
  tank \
  raidz2 \
    /dev/disk/by-id/ata-ST8000VN0022-2EL112_ZA16K42X \
    /dev/disk/by-id/ata-ST8000VN0022-2EL112_ZA177GFA \
    /dev/disk/by-id/ata-ST8000VN0022-2EL112_ZA16KAGJ \
    /dev/disk/by-id/ata-ST8000VN0022-2EL112_ZA12V3DZ \
    /dev/disk/by-id/ata-ST8000VN0022-2EL112_ZA16K437 \
    /dev/disk/by-id/ata-ST8000VN0022-2EL112_ZA16J24Y \
    /dev/disk/by-id/ata-ST8000VN0022-2EL112_ZA16K819 \
    /dev/disk/by-id/ata-ST8000VN0022-2EL112_ZA167ZVK
```

**Pool options:**
| Option | Value | Purpose |
|--------|-------|---------|
| ashift | 12 | 4K sector alignment (2^12 = 4096) |
| compression | lz4 | Fast transparent compression |
| atime | off | Disable access time updates |
| xattr | sa | Store extended attributes in inode |
| acltype | posixacl | Linux ACL support |
| normalization | formD | Unicode filename normalization |

## Dataset Structure

```
/tank
├── media/          # Jellyfin - movies, shows, music
│   ├── movies/
│   ├── shows/
│   └── music/
├── public/         # Community sharing
│   ├── stls/       # 3D print files
│   ├── assets/     # Game assets, etc.
│   └── mirrors/    # Public mirrors/backups
├── data/           # Private data
│   └── datasets/   # ML datasets, large files
└── games/          # K8s game server storage
```

**Create datasets:**
```bash
# Media (Jellyfin)
zfs create tank/media
zfs create tank/media/movies
zfs create tank/media/shows
zfs create tank/media/music

# Public (community)
zfs create tank/public
zfs create tank/public/stls
zfs create tank/public/assets
zfs create tank/public/mirrors

# Private data
zfs create tank/data
zfs create tank/data/datasets

# Game servers
zfs create tank/games

# Set recordsize for large files (do BEFORE writing data)
zfs set recordsize=1M tank/media
zfs set recordsize=1M tank/public
zfs set recordsize=1M tank/data
# tank/games stays at 128K default (mixed file sizes)

# Set ownership
chown -R saavy:users /tank/media /tank/public /tank/data /tank/games
```

## Tank-backed Downloads (SABnzbd staging)

Downloads and final media must be directories in the **same ZFS dataset**. A
shared pool or set of disks is not sufficient: separate datasets are separate
filesystems, so Sonarr/Radarr cannot use atomic renames or hardlinks across the
boundary.

`/tank/media` is the `tank/media` dataset. Keep SABnzbd staging inside it as a
plain directory; do not create a child `tank/media/downloads` dataset.

**Target layout:**

```text
/tank/media/                 # one ZFS dataset and one container mount
├── downloads/
│   ├── complete/            # SABnzbd completed downloads
│   └── incomplete/          # SABnzbd work directory
├── movies/                  # Radarr library
├── shows/                   # Sonarr library
└── music/                   # optional Jellyfin library
```

SABnzbd, Sonarr, Radarr, and Bazarr each receive one hostPath volume from
`/tank/media` to `/media`. Configure paths as follows:

- SABnzbd temporary folder: `/media/downloads/incomplete`
- SABnzbd completed folder: `/media/downloads/complete`
- Sonarr root: `/media/shows`
- Radarr root: `/media/movies`

Using one `/media` mount is intentional. Separate `/downloads` and `/media`
bind mounts can still create a cross-mount boundary inside a container, even
when their host paths ultimately reside on the same filesystem.

### Migration from `/tank/downloads`

Do not merge the prepared Argo CD manifest change until the copy and application
configuration cutover are ready. The source must remain available for rollback.

1. Pre-copy while the stack is online:

   ```bash
   mkdir -p /tank/media/downloads/{complete,incomplete}
   chown -R saavy:users /tank/media/downloads
   rsync -aHAX --numeric-ids --info=progress2 \
     /tank/downloads/ /tank/media/downloads/
   ```

2. When the SABnzbd queue and Arr import activity are quiet, pause SABnzbd and
   temporarily disable the SABnzbd download client in both Sonarr and Radarr.
   Run the final delta sync:

   ```bash
   rsync -aHAX --numeric-ids --delete --info=progress2 \
     /tank/downloads/ /tank/media/downloads/
   rsync -aHAXn --numeric-ids --delete --itemize-changes \
     /tank/downloads/ /tank/media/downloads/
   ```

   The dry run must produce no changes before continuing.

3. Merge/apply the media-stack manifest changes. Wait for SABnzbd, Sonarr,
   Radarr, and Bazarr to become Ready on the new revision. Leave the Arr
   download clients disabled.

4. In SABnzbd `Config → Folders`, set the temporary and completed folders to
   the `/media/downloads/...` paths above. SABnzbd persists these settings in
   its config PVC. Changing folders through SABnzbd's API can clear its paused
   state, so check and pause it again before continuing.

5. Existing SABnzbd history may still report old paths. In both Sonarr and
   Radarr, add/update remote path mappings for host
   `sabnzbd.sabnzbd.svc.cluster.local`:

   | Remote path | Local path |
   |---|---|
   | `/downloads/` | `/media/downloads/` |
   | `/config/Downloads/` | `/media/downloads/` |

6. Verify that both Arr download-client tests pass, then check the filesystem and
   mount boundary from an Arr pod:

   ```bash
   kubectl exec -n sonarr deployment/sonarr -- \
     stat -c '%d %n' /media/downloads /media/shows
   ```

   Both paths must report the same device number. Re-enable both Arr download
   clients, resume SABnzbd, and refresh monitored downloads. All retained queue
   paths should resolve beneath `/media/downloads/`. Then verify a newly
   completed SABnzbd item imports into the library and becomes visible to
   Jellyfin.

7. Keep `/tank/downloads` intact as a rollback baseline until the end-to-end check
   passes. Once SABnzbd resumes, `/tank/media/downloads` is authoritative because
   it receives all new work. Remove the old copy only after verifying the
   destination and deciding that rollback is no longer needed.

**Rollback:** pause SABnzbd, disable both Arr download clients, and synchronize
new work back to the old location before restoring the old manifests:

```bash
rsync -aHAX --numeric-ids --delete \
  /tank/media/downloads/ /tank/downloads/
```

Set SABnzbd's folders back to `/downloads/incomplete` and
`/downloads/complete`, restore the manifests, restart the media apps, verify the
old mount, and only then resume processing.

**Older legacy path:** `/srv/downloads` (NVMe) was used before 2026-02-28 and is
no longer provisioned or mounted.

## Access Methods

No NFS/Samba configured. Access via SSH over Tailscale:

```bash
# SFTP
sftp saavy@superbloom

# SSHFS mount
sshfs saavy@superbloom:/tank /mnt/nas

# rsync (best for large transfers)
rsync -avP saavy@superbloom:/tank/media/ ./local/
rsync -avP ./local/ saavy@superbloom:/tank/data/
```

## Common Commands

```bash
# Pool status
zpool status tank
zpool list tank

# Dataset info
zfs list -r tank
zfs get compressratio tank

# I/O stats (live)
zpool iostat -v 2

# Manual scrub
zpool scrub tank

# Snapshots
zfs snapshot tank/media@backup-$(date +%Y-%m-%d)
zfs list -t snapshot
zfs rollback tank/media@backup-2025-01-01
zfs destroy tank/media@old-snapshot
```

## Drive Replacement

If a drive fails:

```bash
# Check status (shows DEGRADED)
zpool status tank

# After physically replacing the failed drive:
zpool replace tank /dev/disk/by-id/OLD-DRIVE /dev/disk/by-id/NEW-DRIVE

# Monitor resilver
zpool status tank
```

## Expansion

### Add drives to existing RAIDZ2 (ZFS 2.3+)

```bash
# Add one drive at a time, wait for reflow between each
zpool attach tank raidz2-0 /dev/disk/by-id/new-drive

# Monitor progress
zpool status tank
```

### Add a new vdev

```bash
# Add another RAIDZ2 vdev (4+ drives recommended)
zpool add tank raidz2 \
  /dev/disk/by-id/drive1 \
  /dev/disk/by-id/drive2 \
  /dev/disk/by-id/drive3 \
  /dev/disk/by-id/drive4
```

### Replace with larger drives

```bash
# One at a time, resilver between each
zpool replace tank /dev/disk/by-id/old /dev/disk/by-id/new
# Wait for resilver...
# Repeat for all drives...

# After ALL replaced, expand
zpool online -e tank
```

## Future Plans

- Current: 8 × 8TB RAIDZ2 (~43TB usable)
- Planned: 10 × 8TB RAIDZ2 (~58TB usable) + 20TB for backups
- Case upgrade: 8-bay → 12-bay
