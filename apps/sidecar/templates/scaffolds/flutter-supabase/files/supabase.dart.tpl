import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

Future<void> initSupabase() async {
  final url = dotenv.env['SUPABASE_URL'];
  final anon = dotenv.env['SUPABASE_ANON_KEY'];
  if (url == null || anon == null) {
    throw StateError(
      'SUPABASE_URL or SUPABASE_ANON_KEY missing. Copy .env.example to .env.',
    );
  }
  await Supabase.initialize(url: url, anonKey: anon);
}

SupabaseClient get supabase => Supabase.instance.client;
