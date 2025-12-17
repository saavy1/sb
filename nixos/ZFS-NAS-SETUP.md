# ZFS NAS Setup Guide

This guide walks you through setting up an 8-drive ZFS RAIDZ2 NAS on your NixOS system.

## Overview

**Configuration:**
- 8 × 8TB drives
- RAIDZ2 (2 parity drives, 6 usable drives)
- ~48TB usable capacity
- Protected against up to 2 simultaneous drive failures
- Secured via Tailscale VPN

## Prerequisites

Before starting, ensure you have:
1. All 8 drives physically installed
2. Drives are empty (they will be wiped during pool creation)
3. SSH access to the system via Tailscale

## Step 1: Apply NixOS Configuration

The ZFS module has been added to your configuration. Apply it:

```bash
# SSH into your NixOS system via Tailscale
ssh saavy@100.66.91.56

# Switch to root or use sudo
sudo su

# Build and activate the new configuration
nixos-rebuild switch --flake /home/saavy/sb/nixos#superbloom
```

This will:
- Install ZFS kernel module and utilities
- Configure ZFS auto-scrubbing (monthly)
- Set up NFS server
- Open necessary firewall ports (on Tailscale interface only)

## Step 2: Identify Your Drives

Find the device names for your 8 drives:

```bash
# List all block devices
lsblk

# Or use a more detailed view
fdisk -l

# List drives by ID (recommended for ZFS - more stable than /dev/sdX)
ls -l /dev/disk/by-id/
```

Your drives will typically be named like:
- `/dev/disk/by-id/ata-WDC_WD80EZAZ_XXXXXXXX` (for SATA)
- `/dev/disk/by-id/nvme-Samsung_SSD_980_XXXXXXXX` (for NVMe)

**Important:** Use `/dev/disk/by-id/` paths, NOT `/dev/sdX` paths, as these can change on reboot.

## Step 3: Create the ZFS Pool

Create a RAIDZ2 pool with all 8 drives:

```bash
# Replace DRIVE1-DRIVE8 with your actual disk IDs
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
    /dev/disk/by-id/DRIVE1 \
    /dev/disk/by-id/DRIVE2 \
    /dev/disk/by-id/DRIVE3 \
    /dev/disk/by-id/DRIVE4 \
    /dev/disk/by-id/DRIVE5 \
    /dev/disk/by-id/DRIVE6 \
    /dev/disk/by-id/DRIVE7 \
    /dev/disk/by-id/DRIVE8
```

**Options explained:**
- `-o ashift=12`: Optimized for 4K sector drives (8TB drives typically use 4K)
- `-O compression=lz4`: Fast compression (saves space with minimal CPU)
- `-O atime=off`: Don't update access times (better performance)
- `-O xattr=sa`: Store extended attributes efficiently
- `-O acltype=posixacl`: Enable POSIX ACLs
- `-O normalization=formD`: Unicode normalization for cross-platform compatibility
- `-m /tank`: Mount pool at /tank

**Example with real drive names:**
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
    /dev/disk/by-id/ata-WDC_WD80EZAZ-11TDBA0_1234ABCD \
    /dev/disk/by-id/ata-WDC_WD80EZAZ-11TDBA0_1234ABCE \
    /dev/disk/by-id/ata-WDC_WD80EZAZ-11TDBA0_1234ABCF \
    /dev/disk/by-id/ata-WDC_WD80EZAZ-11TDBA0_1234ABCG \
    /dev/disk/by-id/ata-WDC_WD80EZAZ-11TDBA0_1234ABCH \
    /dev/disk/by-id/ata-WDC_WD80EZAZ-11TDBA0_1234ABCI \
    /dev/disk/by-id/ata-WDC_WD80EZAZ-11TDBA0_1234ABCJ \
    /dev/disk/by-id/ata-WDC_WD80EZAZ-11TDBA0_1234ABCK
```

## Step 4: Create ZFS Datasets

Create organized datasets for different types of data:

```bash
# Data dataset (general file storage)
zfs create tank/data

# Backups dataset
zfs create tank/backups

# Media dataset (photos, videos, etc.)
zfs create tank/media

# Optional: dataset for Kubernetes persistent volumes
zfs create tank/k8s-volumes

# Verify datasets
zfs list
```

**Advanced: Per-dataset tuning:**
```bash
# Disable compression for already-compressed media files
zfs set compression=off tank/media

# Enable deduplication for backups (uses more RAM)
# zfs set dedup=on tank/backups

# Set quotas
# zfs set quota=10T tank/media
```

## Step 5: Set Permissions

```bash
# Set ownership for your user
chown -R saavy:users /tank/data
chown -R saavy:users /tank/backups
chown -R saavy:users /tank/media

# Or make world-writable (less secure)
chmod -R 777 /tank/data
```

## Step 6: Verify Pool Status

```bash
# Check pool status
zpool status

# Check pool capacity
zpool list

# Check dataset sizes
zfs list

# View detailed I/O stats
zpool iostat -v 2
```

You should see output like:
```
NAME        SIZE  ALLOC   FREE  EXPANDSZ   FRAG    CAP  DEDUP  HEALTH  ALTROOT
tank       58.2T   464K  58.2T         -     0%     0%  1.00x  ONLINE  -
```

Note: RAIDZ2 with 8 × 8TB drives gives you ~58TB raw, ~48TB usable after parity.

## Step 7: Configure NFS Exports (Already Done)

The NixOS configuration already exports these paths over NFS (Tailscale only):
- `/tank/data`
- `/tank/backups`
- `/tank/media`

Verify NFS is running:
```bash
systemctl status nfs-server
showmount -e localhost
```

## Step 8: Mount on Client Machines

### From Linux/Mac (via Tailscale):
```bash
# Install NFS client (if not already installed)
# Ubuntu/Debian:
sudo apt install nfs-common

# Mac: NFS client is built-in

# Create mount point
sudo mkdir -p /mnt/nas/data

# Mount
sudo mount -t nfs 100.66.91.56:/tank/data /mnt/nas/data

# Add to /etc/fstab for auto-mount:
echo "100.66.91.56:/tank/data /mnt/nas/data nfs defaults,_netdev 0 0" | sudo tee -a /etc/fstab
```

### From Windows (via Tailscale):
1. Enable "Services for NFS" in Windows Features
2. Open Command Prompt as Administrator:
```cmd
mount -o anon \\100.66.91.56\tank\data Z:
```

### Alternative: SMB/Samba (Optional)

If you prefer SMB over NFS, uncomment the Samba configuration in `/home/user/sb/nixos/modules/zfs-nas.nix` and rebuild:

```bash
# Edit the module
sudo vim /home/saavy/sb/nixos/modules/zfs-nas.nix

# Uncomment the services.samba section

# Rebuild
sudo nixos-rebuild switch --flake /home/saavy/sb/nixos#superbloom

# Set Samba password for your user
sudo smbpasswd -a saavy
```

Then mount via SMB:
- **Windows:** `\\100.66.91.56\data`
- **Mac:** `smb://100.66.91.56/data`
- **Linux:** `mount -t cifs //100.66.91.56/data /mnt/nas/data -o username=saavy`

## ZFS Maintenance

### Auto-Scrubbing (Already Configured)

Your system will automatically scrub the pool monthly. Manual scrub:
```bash
zpool scrub tank
zpool status  # Check scrub progress
```

### Snapshots

Create point-in-time snapshots:
```bash
# Manual snapshot
zfs snapshot tank/data@backup-2025-12-17

# List snapshots
zfs list -t snapshot

# Restore from snapshot
zfs rollback tank/data@backup-2025-12-17

# Delete snapshot
zfs destroy tank/data@backup-2025-12-17
```

**Enable auto-snapshots:** Uncomment the `services.zfs.autoSnapshot` section in `/home/user/sb/nixos/modules/zfs-nas.nix`.

### Monitoring

```bash
# Check pool health
zpool status

# Watch I/O in real-time
zpool iostat -v 2

# Check dataset space usage
zfs list -o name,used,avail,refer,mountpoint

# View compression ratio
zfs get compressratio tank

# Check ARC (cache) statistics
arc_summary
```

### Handling Drive Failures

If a drive fails:
```bash
# Check pool status
zpool status

# Replace failed drive (assuming /dev/disk/by-id/OLD-DRIVE failed)
# After physically replacing the drive:
zpool replace tank /dev/disk/by-id/OLD-DRIVE /dev/disk/by-id/NEW-DRIVE

# Monitor resilver progress
zpool status
```

RAIDZ2 can survive up to 2 drive failures before data loss.

### Expanding Storage

To add more drives in the future (not recommended for RAIDZ2, but possible):
```bash
# Add another RAIDZ2 vdev (requires 3+ more drives)
zpool add tank raidz2 /dev/disk/by-id/NEW1 /dev/disk/by-id/NEW2 /dev/disk/by-id/NEW3
```

**Note:** You cannot expand an existing RAIDZ2 vdev. You can only add new vdevs.

## Performance Tuning

### Adjust ZFS ARC (Cache)

By default, ZFS uses 50% of RAM for ARC. To adjust, edit `/home/user/sb/nixos/modules/zfs-nas.nix`:

```nix
boot.kernel.sysctl = {
  # Set max ARC size to 32GB (in bytes)
  "vm.swappiness" = 1;
};

# Then add to the ZFS module:
boot.extraModprobeConfig = ''
  options zfs zfs_arc_max=34359738368
'';
```

### Enable L2ARC (SSD Cache)

If you have spare SSDs, use them as L2ARC:
```bash
# Add SSD as cache device
zpool add tank cache /dev/disk/by-id/YOUR-SSD
```

## Security Notes

1. **Tailscale VPN:** All NFS/SMB traffic is encrypted via Tailscale
2. **Firewall:** NFS ports (2049) are only open on the Tailscale interface
3. **No public exposure:** The NAS is not accessible from the internet
4. **Encryption:** For encryption at rest, use ZFS native encryption (requires re-creating pool)

### Enable ZFS Encryption (Optional - Advanced)

If you need encryption at rest, you must create the pool with encryption:

```bash
# Create encrypted pool (do this INSTEAD of Step 3)
zpool create -f \
  -o ashift=12 \
  -O encryption=aes-256-gcm \
  -O keyformat=passphrase \
  -O keylocation=prompt \
  -O compression=lz4 \
  -O atime=off \
  -m /tank \
  tank \
  raidz2 [YOUR 8 DRIVES]

# You'll be prompted for a passphrase
```

**Note:** This requires entering the passphrase on every boot. For auto-unlock, use a key file.

## Troubleshooting

### Pool won't import on boot
```bash
# Manually import
zpool import -f tank

# Check systemd service
systemctl status zfs-import-tank
journalctl -u zfs-import-tank
```

### Slow performance
```bash
# Check if drives are in write-back mode
hdparm -W /dev/sdX

# Enable write-back cache (careful - requires good UPS)
hdparm -W1 /dev/sdX

# Check pool fragmentation
zpool list -o name,frag

# Defragment if needed (slow)
zfs send tank/data@snapshot | zfs receive tank/data-new
```

### Out of space
```bash
# Find what's using space
zfs list -o name,used,avail,refer -r tank

# Delete old snapshots
zfs list -t snapshot
zfs destroy tank/data@old-snapshot

# Enable quota on datasets
zfs set quota=5T tank/media
```

## Next Steps

1. **Set up monitoring:** Install Grafana + Prometheus with ZFS exporter
2. **Configure alerts:** Get notified of drive failures via Discord/email
3. **Test backups:** Regularly test snapshot restoration
4. **Document your setup:** Keep a record of drive serial numbers and pool configuration
5. **UPS:** Consider a UPS to protect against power failures during writes

## Useful Resources

- [ZFS Administration Guide](https://openzfs.github.io/openzfs-docs/)
- [NixOS ZFS Documentation](https://nixos.wiki/wiki/ZFS)
- [ZFS Best Practices](https://jrs-s.net/2018/08/17/zfs-tuning-cheat-sheet/)

## Summary

Your ZFS NAS is now configured with:
- ✅ RAIDZ2 pool with 8 × 8TB drives (~48TB usable)
- ✅ Monthly automatic scrubbing
- ✅ NFS exports over Tailscale
- ✅ SMB/Samba support (optional)
- ✅ LZ4 compression enabled
- ✅ Automatic pool import on boot

The NAS is accessible only via Tailscale VPN at `100.66.91.56`.
