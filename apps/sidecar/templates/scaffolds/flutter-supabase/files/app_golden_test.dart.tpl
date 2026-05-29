// Goldens en emulador / device usando matchesGoldenFile nativo.
// Útil cuando necesitas validar pixel-perfect SOBRE el device real
// (densidad, fuentes nativas, etc.). El smoke golden de host vive
// en test/smoke_golden_test.dart usando alchemist (más estable).

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('seed golden device — empty scaffold matches device baseline', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(
        child: MaterialApp(
          home: Scaffold(body: Center(child: Text('scaffold'))),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await expectLater(
      find.byType(MaterialApp),
      matchesGoldenFile('goldens/scaffold_empty_device.png'),
    );
  });
}
