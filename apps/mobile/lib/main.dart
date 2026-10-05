import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

import 'sync_service.dart';

/// PHRAMA field booker app — entry point.
///
/// UNTESTED SCAFFOLD: compiles only with the Flutter SDK installed
/// (`flutter pub get && flutter run`). The sync engine (lib/sync_service.dart)
/// mirrors the tested server contract (apps/api/src/sync).
void main() => runApp(const PhramaBookerApp());

class PhramaBookerApp extends StatelessWidget {
  const PhramaBookerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'PHRAMA Booker',
      theme: ThemeData(useMaterial3: true, colorSchemeSeed: const Color(0xFF1a73e8)),
      home: const LoginScreen(),
    );
  }
}

// ─────────────────────────── Login ───────────────────────────

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _username = TextEditingController();
  final _password = TextEditingController();
  String _server = 'http://10.0.2.2:4000'; // Android emulator -> host machine
  String? _error;
  bool _busy = false;

  Future<void> _login() async {
    setState(() { _busy = true; _error = null; });
    try {
      final res = await http.post(
        Uri.parse('$_server/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'username': _username.text.trim(), 'password': _password.text}),
      );
      if (res.statusCode != 200 && res.statusCode != 201) throw Exception('Wrong username or password');
      final token = (jsonDecode(res.body) as Map)['accessToken'] as String;
      final sync = SyncService(SyncConfig(_server, token));
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => HomeScreen(sync: sync)));
    } catch (e) {
      setState(() { _error = 'Wrong username or password'; _busy = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(32),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 360),
            child: Column(
              children: [
                const Text('PHRAMA', style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold)),
                const Text('Field Booker', style: TextStyle(color: Colors.grey)),
                const SizedBox(height: 32),
                TextField(controller: TextEditingController(text: _server), onChanged: (v) => _server = v,
                    decoration: const InputDecoration(labelText: 'Server', border: OutlineInputBorder())),
                const SizedBox(height: 12),
                TextField(controller: _username, decoration: const InputDecoration(labelText: 'Username', border: OutlineInputBorder())),
                const SizedBox(height: 12),
                TextField(controller: _password, obscureText: true, decoration: const InputDecoration(labelText: 'Password', border: OutlineInputBorder())),
                const SizedBox(height: 20),
                if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(onPressed: _busy ? null : _login, child: Text(_busy ? 'Signing in…' : 'Sign in')),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────── Home: shops + order pad ───────────────────────────

class HomeScreen extends StatefulWidget {
  final SyncService sync;
  const HomeScreen({super.key, required this.sync});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  Map<String, dynamic>? _data;
  bool _refreshing = true;
  int _pending = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final cached = await widget.sync.cachedServerData();
    setState(() { _data = _data ?? cached; _refreshing = true; });
    final fresh = await widget.sync.pullServerData();
    await widget.sync.pushOutbox();
    final count = await widget.sync.pendingCount();
    if (mounted) setState(() { if (fresh != null) _data = fresh; _refreshing = false; _pending = count; });
  }

  @override
  Widget build(BuildContext context) {
    final customers = (_data?['customers'] as List?)?.cast<Map<String, dynamic>>() ?? [];
    return Scaffold(
      appBar: AppBar(
        title: const Text('Today\'s Shops'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
          Badge(
            isLabelVisible: _pending > 0,
            label: Text('$_pending'),
            child: const Icon(Icons.cloud_upload),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView.builder(
          itemCount: customers.length,
          itemBuilder: (context, i) {
            final c = customers[i];
            final balance = (c['balancePaisa'] as num?) ?? 0;
            return ListTile(
              title: Text(c['name'] as String),
              subtitle: Text('${c['code']} · ${c['territoryName'] ?? 'no area'} · ${(c['type'] as String?) ?? 'REGULAR'}'),
              trailing: Text(
                'Rs ${(balance / 100).toStringAsFixed(0)}',
                style: TextStyle(fontWeight: FontWeight.bold, color: balance > 0 ? Colors.red : Colors.green),
              ),
              onTap: () => Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => OrderPadScreen(sync: widget.sync, customer: c, catalog: _data?['catalog'] as List? ?? []),
              )),
            );
          },
        ),
      ),
    );
  }
}

// ─────────────────────────── Order pad (mirrors the paper pad) ───────────────────────────

class OrderPadScreen extends StatefulWidget {
  final SyncService sync;
  final Map<String, dynamic> customer;
  final List catalog;
  const OrderPadScreen({super.key, required this.sync, required this.customer, required this.catalog});
  @override
  State<OrderPadScreen> createState() => _OrderPadScreenState();
}

class _OrderPadScreenState extends State<OrderPadScreen> {
  final _qty = <String, TextEditingController>{}; // productId -> qty
  bool _queued = false;

  @override
  void dispose() {
    for (final c in _qty.values) c.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final items = <Map<String, dynamic>>[];
    for (final e in _qty.entries) {
      final q = int.tryParse(e.value.text) ?? 0;
      if (q > 0) items.add({'productId': e.key, 'qty': q});
    }
    if (items.isEmpty) return;
    await widget.sync.queueOrder(customerId: widget.customer['id'] as String, items: items);
    if (mounted) setState(() { _queued = true; });
  }

  @override
  Widget build(BuildContext context) {
    final grouped = <String, List<Map<String, dynamic>>>{};
    for (final raw in widget.catalog) {
      final p = raw as Map<String, dynamic>;
      grouped.putIfAbsent(p['companyCode'] as String? ?? '?', () => []).add(p);
    }
    return Scaffold(
      appBar: AppBar(title: Text(widget.customer['name'] as String)),
      body: _queued
          ? const Center(child: Column(mainAxisSize: MainAxisSize.min,
              children: [Icon(Icons.check_circle, color: Colors.green, size: 64),
                SizedBox(height: 12), Text('Order saved — will sync when signal returns')]))
          : ListView(
              children: grouped.entries.map((group) => ExpansionTile(
                title: Text(group.key, style: const TextStyle(fontWeight: FontWeight.bold)),
                initiallyExpanded: true,
                children: group.value.map((p) => ListTile(
                  title: Text('${p['code']} · ${p['name']}'),
                  subtitle: Text('${p['pack'] ?? ''} · Rs ${((p['salePricePaisa'] as num) / 100).toStringAsFixed(0)} · stock ${p['stockInMain']}'),
                  trailing: SizedBox(
                    width: 90,
                    child: TextField(
                      controller: _qty.putIfAbsent(p['id'] as String, () => TextEditingController()),
                      keyboardType: TextInputType.number,
                      textAlign: TextAlign.center,
                      decoration: const InputDecoration(hintText: 'Qty', border: OutlineInputBorder()),
                    ),
                  ),
                )).toList(),
              )).toList(),
            ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: FilledButton(
            onPressed: _queued ? null : _save,
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
            child: Text(_queued ? 'Saved' : 'Save order (works offline)'),
          ),
        ),
      ),
    );
  }
}
