import 'package:alchemist/alchemist.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  goldenTest(
    'seed golden — empty scaffold renders consistently',
    fileName: 'scaffold_empty',
    builder: () => GoldenTestGroup(
      children: [
        GoldenTestScenario(
          name: 'light',
          child: const MaterialApp(
            home: Scaffold(body: Center(child: Text('scaffold'))),
          ),
        ),
        GoldenTestScenario(
          name: 'dark',
          child: MaterialApp(
            theme: ThemeData.dark(useMaterial3: true),
            home: const Scaffold(body: Center(child: Text('scaffold'))),
          ),
        ),
      ],
    ),
  );
}
