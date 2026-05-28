import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:golden_toolkit/golden_toolkit.dart';

void main() {
  testGoldens('seed golden — empty scaffold renders', (tester) async {
    await tester.pumpWidgetBuilder(
      const Scaffold(body: Center(child: Text('scaffold'))),
      wrapper: materialAppWrapper(theme: ThemeData.light(useMaterial3: true)),
    );
    await screenMatchesGolden(tester, 'scaffold_empty');
  });
}
