import fs from 'fs';
import path from 'path';

/**
 * Postlink hook for time-tracking plugin.
 *
 * Creates ~/time_tracking directory with required subdirectories
 * and symlinks .opencode/time_tracking -> ~/time_tracking so that
 * time tracking data is stored globally and shared across projects.
 */
export default function postlink({ targetDir, homeDir, log }) {
  const timeTrackingDir = path.join(homeDir, 'time_tracking');
  const symlinkPath = path.join(targetDir, 'time_tracking');

  // 1. Create ~/time_tracking + subdirs if missing
  for (const subdir of ['', 'bookings', 'charts', 'reports']) {
    const dirPath = path.join(timeTrackingDir, subdir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      log.success(`Created ${dirPath.replace(homeDir, '~')}`);
    }
  }

  // 2. Symlink .opencode/time_tracking -> ~/time_tracking
  let targetExists = false;
  let targetIsSymlink = false;
  try {
    const stat = fs.lstatSync(symlinkPath);
    targetExists = true;
    targetIsSymlink = stat.isSymbolicLink();
  } catch {
    targetExists = false;
  }

  if (targetExists && targetIsSymlink) {
    const existing = fs.readlinkSync(symlinkPath);
    if (existing === timeTrackingDir) return; // already correct
    fs.unlinkSync(symlinkPath);
    fs.symlinkSync(timeTrackingDir, symlinkPath);
    log.warning(`time_tracking -> ~/time_tracking (overridden)`);
  } else if (targetExists) {
    log.warning(`time_tracking (real directory, not overriding)`);
  } else {
    fs.symlinkSync(timeTrackingDir, symlinkPath);
    log.success(`time_tracking -> ~/time_tracking`);
  }
}
