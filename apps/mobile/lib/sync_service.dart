import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;
import 'package:sqflite/sqflite.dart';

/// Offline-first sync engine.
///
/// Everything the booker does (orders, recoveries) is written to the local
/// SQLite queue FIRST, applied to the UI immediately, and pushed to the server
/// opportunistically. The server is idempotent by clientRef, so blind retries
/// are safe — that is the whole conflict-resolution story.
///
/// Server data (catalog + shop balances) is pulled fresh whenever a connection
/// exists and cached locally so the app works with no signal at all.

class SyncConfig {
  final String baseUrl; // e.g. https://api.phrama.pk
  final String token;
  SyncConfig(this.baseUrl, this.token);
}

class SyncService {
  final SyncConfig config;
  Database? _db;

  SyncService(this.config);

  Future<Database> get db async {
    _db ??= await _openDb();
    return _db!;
  }

  Future<Database> _openDb() async {
    return openDatabase(
      'phrama_booker.db',
      version: 1,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE outbox (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL,          -- ORDER | RECOVERY
            client_ref TEXT NOT NULL UNIQUE,
            payload TEXT NOT NULL,       -- JSON
            pushed INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
          )''');
        await db.execute('''
          CREATE TABLE cache (
            key TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            fetched_at TEXT NOT NULL
          )''');
      },
    );
  }

  String _newClientRef() {
    final rand = Random().nextInt(1 << 32).toRadixString(36);
    return 'bk-${DateTime.now().millisecondsSinceEpoch.toRadixString(36)}-$rand';
  }

  // ─────────────── OUTBOX: queue locally, push when signal returns ───────────────

  /// Order: items [{productId, qty}], customerId = shop, optional viaCustomerId (salesman).
  Future<String> queueOrder({
    required String customerId,
    String? viaCustomerId,
    required List<Map<String, dynamic>> items,
  }) async {
    final ref = _newClientRef();
    final payload = jsonEncode({
      'clientRef': ref,
      'customerId': customerId,
      if (viaCustomerId != null) 'viaCustomerId': viaCustomerId,
      'bookedAt': DateTime.now().toUtc().toIso8601String(),
      'items': items,
    });
    final database = await db;
    await database.insert('outbox', {
      'kind': 'ORDER',
      'client_ref': ref,
      'payload': payload,
      'created_at': DateTime.now().toUtc().toIso8601String(),
    });
    return ref;
  }

  /// Recovery: amountPaisa, mode CASH|BANK — recorded at the shop.
  Future<String> queueRecovery({
    required String customerId,
    required int amountPaisa,
    required String mode,
  }) async {
    final ref = _newClientRef();
    final payload = jsonEncode({
      'clientRef': ref,
      'customerId': customerId,
      'amountPaisa': amountPaisa,
      'mode': mode,
      'collectedAt': DateTime.now().toUtc().toIso8601String(),
    });
    final database = await db;
    await database.insert('outbox', {
      'kind': 'RECOVERY',
      'client_ref': ref,
      'payload': payload,
      'created_at': DateTime.now().toUtc().toIso8601String(),
    });
    return ref;
  }

  /// Push everything queued; returns count of newly pushed items.
  /// Server collapses duplicates by clientRef, so re-pushing pushed items is safe.
  Future<int> pushOutbox() async {
    final database = await db;
    final rows = await database.query('outbox', where: 'pushed = 0', orderBy: 'id');
    var pushed = 0;
    for (final row in rows) {
      final kind = row['kind'] as String;
      final path = kind == 'ORDER' ? '/sync/orders' : '/sync/recoveries';
      try {
        final res = await http.post(
          Uri.parse('${config.baseUrl}$path'),
          headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer ${config.token}'},
          body: row['payload'] as String,
        );
        if (res.statusCode == 201 || res.statusCode == 200) {
          await database.update('outbox', {'pushed': 1}, where: 'id = ?', whereArgs: [row['id']]);
          pushed++;
        } else if (res.statusCode == 400 || res.statusCode == 403) {
          // permanently rejected (e.g. validation) — mark pushed to avoid poison loop; keep payload for review
          await database.update('outbox', {'pushed': 1}, where: 'id = ?', whereArgs: [row['id']]);
        }
        // 5xx / no network: leave unpushed, retry next time
      } catch (_) {
        break; // no signal — stop pushing, stay queued
      }
    }
    return pushed;
  }

  // ─────────────── PULL: fresh catalog + balances when connected ───────────────

  Future<Map<String, dynamic>?> pullServerData() async {
    try {
      final res = await http.get(
        Uri.parse('${config.baseUrl}/sync/pull'),
        headers: {'Authorization': 'Bearer ${config.token}'},
      );
      if (res.statusCode != 200) return null;
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      // cache is best-effort: on web (no sqlite) or fresh-VM tests we still return live data
      try {
        final database = await db;
        await database.insert(
          'cache',
          {'key': 'pull', 'payload': res.body, 'fetched_at': DateTime.now().toUtc().toIso8601String()},
          conflictAlgorithm: ConflictAlgorithm.replace,
        );
      } catch (_) {
        // no sqlite here — cachedServerData() stays null; UI falls back to live-only
      }
      return data;
    } catch (_) {
      return null; // offline — cached copy remains usable
    }
  }

  Future<Map<String, dynamic>?> cachedServerData() async {
    final database = await db;
    final rows = await database.query('cache', where: 'key = ?', whereArgs: ['pull'], limit: 1);
    if (rows.isEmpty) return null;
    return jsonDecode(rows.first['payload'] as String) as Map<String, dynamic>;
  }

  Future<int> pendingCount() async {
    final database = await db;
    final r = await database.rawQuery('SELECT COUNT(*) c FROM outbox WHERE pushed = 0');
    return (r.first['c'] as int?) ?? 0;
  }
}
