# Tests

Estructura espejo a `lib/features/<feature>/`:

```
test/features/<feature>/
  <feature>_model_test.dart            # unit: model fromJson/toJson/copyWith
  <feature>_repository_test.dart       # unit: repository con mocktail
  <feature>_screen_test.dart           # widget: ProviderScope + overrides
  <feature>_screen_golden_test.dart    # golden: light + dark, phone + tablet
  goldens/                             # PNG baselines (versionados)

integration_test/<feature>_smoke_test.dart   # boot + navegar + 1 interacción
```

## Reglas

1. **Toda feature nueva** lleva los 5 archivos. Sin excepciones.
2. **Mocks vía `mocktail`**, no `mockito`. Sin codegen.
3. **Golden baselines** se generan con `flutter test --update-goldens`. La PR no se aprueba sin baselines commiteadas.
4. **Integration tests** corren sobre el emulador real con `flutter test integration_test/`.

## Comandos

```bash
flutter test                           # unit + widget + golden
flutter test --update-goldens          # regenerar baselines
flutter test integration_test/         # smoke en device
flutter test --coverage                # con cobertura → coverage/lcov.info
```

## Seed tests

Los archivos `smoke_test.dart`, `smoke_golden_test.dart` y
`app_boot_test.dart` validan que el scaffold compila. Si tus tests pasan
pero los seed fallan, el scaffold se corrompió — re-corre la tarea T0.
