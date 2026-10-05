// Integration contract test: the booker app's SyncService against the LIVE API.
// Requires the API running (docker compose up -d --wait api).
// Runs in the plain Dart VM (no platform channels) — sqlite queue operations are
// skipped via graceful degradation; the HTTP contract is what we verify here.
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:phrama_booker/sync_service.dart';

void main() {
  late SyncService sync;
  late String token;

  setUpAll(() async {
    // login exactly like the app does
    final res = await http.post(
      Uri.parse('http://localhost:4000/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'username': 'admin', 'password': 'phrama123'}),
    );
    expect(res.statusCode, inInclusiveRange(200, 201), reason: 'API must be up (docker compose up -d --wait api)');
    token = (jsonDecode(res.body) as Map)['accessToken'] as String;
    sync = SyncService(SyncConfig('http://localhost:4000', token));
  });

  test('pull: server responds with catalog + customers for the field day', () async {
    final data = await sync.pullServerData();
    expect(data, isNotNull);
    expect(data!['catalog'], isNotEmpty);
    expect(data['customers'], isNotEmpty);
    final first = (data['catalog'] as List).first as Map;
    expect(first.keys, containsAll(['id', 'code', 'name', 'salePricePaisa', 'stockInMain']));
  });

  test('order upload: idempotent by clientRef — phone retries are safe', () async {
    final ref = 'test-int-${DateTime.now().millisecondsSinceEpoch.toRadixString(36)}';
    final customers = (await sync.pullServerData())!['customers'] as List;
    final customer = customers.first as Map;

    final catalog = (await sync.pullServerData())!['catalog'] as List;
    final productId = (catalog.first as Map)['id'] as String;

    final payload = jsonEncode({
      'clientRef': ref,
      'customerId': customer['id'],
      'items': [
        {'productId': productId, 'qty': 2}
      ],
    });

    Future<http.Response> post(String body) async => await http.post(
          Uri.parse('http://localhost:4000/sync/orders'),
          headers: {'Content-Type': 'application/json', 'Authorization': 'Bearer $token'},
          body: body,
        );

    final first = await post(payload);
    expect(first.statusCode, 201);
    final second = await post(payload);
    expect(second.statusCode, 201);
    expect((jsonDecode(second.body) as Map)['duplicate'], isTrue,
        reason: 'retry must collapse onto the same order');
  });
}
