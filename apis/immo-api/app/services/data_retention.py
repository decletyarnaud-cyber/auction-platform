"""
Data retention manager for auction listings
- Retains data for 2 months
- Auto-cleans expired listings
- Tracks new listings (< 7 days old)
"""
import sqlite3
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Optional, Tuple
import json
import shutil


class DataRetentionManager:
    """Manages auction data lifecycle with 2-month retention"""

    RETENTION_DAYS = 60  # 2 months
    NEW_LISTING_DAYS = 7  # Listings less than 7 days old are "new"

    def __init__(self, db_path: str):
        self.db_path = db_path
        self.backup_dir = Path(db_path).parent / "backups"
        self.backup_dir.mkdir(exist_ok=True)

        # Ensure schema has required columns
        self._ensure_schema()

    def _ensure_schema(self):
        """Add retention columns if they don't exist"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Check existing columns
        cursor.execute("PRAGMA table_info(auctions)")
        existing_columns = {row[1] for row in cursor.fetchall()}

        # Add first_seen_at if missing
        if "first_seen_at" not in existing_columns:
            cursor.execute("""
                ALTER TABLE auctions
                ADD COLUMN first_seen_at TIMESTAMP
            """)
            print("[DataRetention] Added first_seen_at column")

        # Add expires_at if missing
        if "expires_at" not in existing_columns:
            cursor.execute("""
                ALTER TABLE auctions
                ADD COLUMN expires_at TIMESTAMP
            """)
            print("[DataRetention] Added expires_at column")

        # Set values for existing rows
        cursor.execute("""
            UPDATE auctions
            SET first_seen_at = COALESCE(first_seen_at, created_at, datetime('now'))
            WHERE first_seen_at IS NULL
        """)

        cursor.execute(f"""
            UPDATE auctions
            SET expires_at = datetime(COALESCE(first_seen_at, created_at, datetime('now')), '+{self.RETENTION_DAYS} days')
            WHERE expires_at IS NULL
        """)

        conn.commit()
        conn.close()

    def get_new_listings(self, days: int = None) -> List[Dict]:
        """Get listings first seen in the last N days (default: 7)"""
        if days is None:
            days = self.NEW_LISTING_DAYS

        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cutoff_date = (datetime.now() - timedelta(days=days)).isoformat()

        cursor.execute("""
            SELECT id, source, url, adresse, ville, code_postal,
                   mise_a_prix, surface, date_vente, tribunal,
                   first_seen_at
            FROM auctions
            WHERE first_seen_at > ?
            ORDER BY first_seen_at DESC
        """, (cutoff_date,))

        listings = [dict(row) for row in cursor.fetchall()]
        conn.close()

        return listings

    def get_expiring_listings(self, days_until_expiry: int = 7) -> List[Dict]:
        """Get listings that will expire within N days"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        now = datetime.now().isoformat()
        future = (datetime.now() + timedelta(days=days_until_expiry)).isoformat()

        cursor.execute("""
            SELECT id, source, url, adresse, ville, code_postal,
                   mise_a_prix, surface, date_vente, tribunal,
                   first_seen_at, expires_at
            FROM auctions
            WHERE expires_at BETWEEN ? AND ?
            ORDER BY expires_at ASC
        """, (now, future))

        listings = [dict(row) for row in cursor.fetchall()]
        conn.close()

        return listings

    def get_statistics(self) -> Dict:
        """Get data retention statistics"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        now = datetime.now()
        new_cutoff = (now - timedelta(days=self.NEW_LISTING_DAYS)).isoformat()
        expire_soon = (now + timedelta(days=7)).isoformat()
        now_iso = now.isoformat()

        # Total count
        cursor.execute("SELECT COUNT(*) FROM auctions")
        total = cursor.fetchone()[0]

        # New this week
        cursor.execute("SELECT COUNT(*) FROM auctions WHERE first_seen_at > ?", (new_cutoff,))
        new_count = cursor.fetchone()[0]

        # Expiring soon
        cursor.execute("""
            SELECT COUNT(*) FROM auctions
            WHERE expires_at BETWEEN ? AND ?
        """, (now_iso, expire_soon))
        expiring_soon = cursor.fetchone()[0]

        # Already expired (should be cleaned)
        cursor.execute("SELECT COUNT(*) FROM auctions WHERE expires_at < ?", (now_iso,))
        expired = cursor.fetchone()[0]

        # By source
        cursor.execute("""
            SELECT source, COUNT(*) as count
            FROM auctions
            GROUP BY source
        """)
        by_source = {row[0]: row[1] for row in cursor.fetchall()}

        # By week
        cursor.execute("""
            SELECT strftime('%Y-W%W', first_seen_at) as week, COUNT(*) as count
            FROM auctions
            WHERE first_seen_at > datetime('now', '-8 weeks')
            GROUP BY week
            ORDER BY week DESC
        """)
        by_week = {row[0]: row[1] for row in cursor.fetchall()}

        conn.close()

        return {
            "total": total,
            "new_this_week": new_count,
            "expiring_within_7_days": expiring_soon,
            "expired_pending_cleanup": expired,
            "by_source": by_source,
            "by_week": by_week,
            "retention_days": self.RETENTION_DAYS,
            "new_listing_threshold_days": self.NEW_LISTING_DAYS,
        }

    def backup_expired_listings(self) -> Tuple[str, int]:
        """Backup expired listings before deletion"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        now_iso = datetime.now().isoformat()

        cursor.execute("""
            SELECT * FROM auctions WHERE expires_at < ?
        """, (now_iso,))

        expired_rows = [dict(row) for row in cursor.fetchall()]
        conn.close()

        if not expired_rows:
            return "", 0

        # Create backup file
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_file = self.backup_dir / f"expired_auctions_{timestamp}.json"

        with open(backup_file, "w", encoding="utf-8") as f:
            json.dump({
                "exported_at": datetime.now().isoformat(),
                "count": len(expired_rows),
                "auctions": expired_rows,
            }, f, ensure_ascii=False, indent=2, default=str)

        return str(backup_file), len(expired_rows)

    def cleanup_expired(self, backup_first: bool = True) -> Dict:
        """Delete expired listings (with optional backup)"""
        backup_path = ""
        backup_count = 0

        if backup_first:
            backup_path, backup_count = self.backup_expired_listings()

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        now_iso = datetime.now().isoformat()

        # Count before delete
        cursor.execute("SELECT COUNT(*) FROM auctions WHERE expires_at < ?", (now_iso,))
        to_delete = cursor.fetchone()[0]

        # Delete expired
        cursor.execute("DELETE FROM auctions WHERE expires_at < ?", (now_iso,))
        deleted = cursor.rowcount

        conn.commit()
        conn.close()

        return {
            "deleted_count": deleted,
            "backup_path": backup_path,
            "backup_count": backup_count,
        }

    def set_expiry_for_new_listings(self):
        """Set expires_at for listings that don't have it"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute(f"""
            UPDATE auctions
            SET expires_at = datetime(COALESCE(first_seen_at, CURRENT_TIMESTAMP), '+{self.RETENTION_DAYS} days')
            WHERE expires_at IS NULL
        """)

        updated = cursor.rowcount
        conn.commit()
        conn.close()

        return updated

    def clean_old_backups(self, keep_days: int = 30):
        """Remove backup files older than N days"""
        cutoff = datetime.now() - timedelta(days=keep_days)
        removed = 0

        for backup_file in self.backup_dir.glob("expired_auctions_*.json"):
            if backup_file.stat().st_mtime < cutoff.timestamp():
                backup_file.unlink()
                removed += 1

        return removed


# Singleton
_manager: Optional[DataRetentionManager] = None


def get_retention_manager() -> DataRetentionManager:
    """Get or create the data retention manager"""
    global _manager
    if _manager is None:
        db_path = os.environ.get(
            "DB_PATH",
            "/Users/ade/projects/web/auction-platform/data/auctions_unified.db"
        )
        _manager = DataRetentionManager(db_path)
    return _manager


def run_daily_cleanup():
    """Run daily cleanup task (call from scheduler)"""
    manager = get_retention_manager()

    # Set expiry for any new listings
    manager.set_expiry_for_new_listings()

    # Cleanup expired with backup
    result = manager.cleanup_expired(backup_first=True)

    # Clean old backups (keep last 30 days)
    manager.clean_old_backups(keep_days=30)

    return result


if __name__ == "__main__":
    # Test the manager
    manager = get_retention_manager()

    print("\n=== Data Retention Statistics ===")
    stats = manager.get_statistics()
    print(f"Total auctions: {stats['total']}")
    print(f"New this week: {stats['new_this_week']}")
    print(f"Expiring soon: {stats['expiring_within_7_days']}")
    print(f"Expired (pending cleanup): {stats['expired_pending_cleanup']}")
    print(f"\nBy source: {stats['by_source']}")
    print(f"\nBy week: {stats['by_week']}")

    print("\n=== New Listings (last 7 days) ===")
    new_listings = manager.get_new_listings()
    for listing in new_listings[:5]:
        print(f"  - {listing['adresse']} ({listing['ville']}) - {listing['first_seen_at']}")
    if len(new_listings) > 5:
        print(f"  ... and {len(new_listings) - 5} more")
