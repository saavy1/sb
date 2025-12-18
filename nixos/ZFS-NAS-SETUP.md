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

## NVMe Fast Storage

For downloads and temporary files (Sabnzbd, etc.):

```bash
mkdir -p /srv/downloads/{complete,incomplete}
chown -R saavy:users /srv/downloads
```

**Layout:**
```
/srv/downloads/      # NVMe (fast, temporary)
├── complete/        # Sabnzbd completed downloads
└── incomplete/      # Sabnzbd in-progress

/tank/media/         # ZFS pool (final destination)
├── movies/          # Radarr moves here
└── shows/           # Sonarr moves here
```

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
