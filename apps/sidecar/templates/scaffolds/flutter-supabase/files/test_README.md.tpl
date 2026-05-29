# Tests

Cuatro niveles. Unit/widget/golden corren en host; integration en emulador.

```
test/features/<feature>/
  <feature>_model_test.dart            # unit: model fromJson/toJson/copyWith
  <feature>_repository_test.dart       # unit: repository con mocktail
  <feature>_screen_test.dart           # widget: ProviderScope + overrides
  <feature>_golden_test.dart           # golden (alchemist): light + dark
test/goldens/                          # PNG baselines (versionados)

integration_test/
  <feature>_smoke_test.dart            # boot + navegar + 1 interacción
  <feature>_golden_device_test.dart    # matchesGoldenFile sobre device real
  goldens/                             # baselines de device
```

## Reglas

1. **Toda feature nueva** lleva los 4 archivos de host + 2 de integration.
2. **Mocks vía `mocktail`**, no `mockito`. Sin codegen.
3. **Goldens de host** usan `alchemist`. CI activado, platform shadows desactivado → mismos bytes en Linux/Mac/Win.
4. **Goldens de device** usan `matchesGoldenFile` nativo, solo cuando necesitas validar pixel-perfect en el AVD.
5. **Baselines** se generan con `flutter test --update-goldens`. La PR no se aprueba sin baselines commiteadas.

## Comandos

```bash
flutter test                                              # unit + widget + golden (host)
flutter test --update-goldens                             # regenerar baselines host
flutter test integration_test/                            # smoke + golden device (emulador requerido)
flutter test integration_test/ --update-goldens           # regenerar baselines device
flutter test --coverage                                   # cobertura → coverage/lcov.info
```

## Seed tests

Los archivos `smoke_test.dart`, `smoke_golden_test.dart`, `widget_test.dart` (host) y `app_boot_test.dart`, `app_golden_test.dart` (emulador) validan que el scaffold compila. El primer scaffold genera el baseline `test/goldens/scaffold_empty.png` automáticamente. Si tus tests pasan pero los seed fallan, el scaffold se corrompió — re-corre la tarea T0.
