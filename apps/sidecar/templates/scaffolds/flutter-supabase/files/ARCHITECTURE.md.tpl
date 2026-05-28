# Arquitectura — {{projectName}}

> Este archivo es la fuente de verdad de las decisiones técnicas del proyecto.
> Los agentes que implementan features LEEN este archivo antes de tocar código.

## Stack

- **Flutter** (canal stable, Dart 3.x)
- **Plataformas**: Android, Web
- **Backend**: Supabase (Auth + Postgres + RLS)
- **State management**: Riverpod (`flutter_riverpod`)
- **Routing**: go_router (declarativo, redirect-based auth)
- **Persistencia local**: Supabase + cache en memoria (Riverpod state)
- **UI**: Material 3 con `ColorScheme.fromSeed`, soporte light + dark
- **Charts**: `fl_chart`
- **Locale/Formatos**: `intl` (es_CO por defecto)
- **Env**: `flutter_dotenv` (`.env` en raíz de `05-build/app/`)

## Layout (feature-first)

```
05-build/app/
  lib/
    core/                 # config compartida
      theme.dart          # appTheme(Brightness)
      router.dart         # appRouterProvider
      supabase.dart       # initSupabase() + supabase getter
    features/
      <feature>/
        data/             # repositories que hablan con Supabase
          <feature>_repository.dart
        domain/           # modelos puros, enums, value objects
          <feature>.dart
        presentation/     # providers + screens + widgets
          <feature>_provider.dart
          <feature>_screen.dart
    main.dart             # initSupabase + ProviderScope + MaterialApp.router
  .env                    # SUPABASE_URL, SUPABASE_ANON_KEY (gitignored)
  .env.example            # plantilla committeable
```

## Convenciones

- **Naming**: snake_case para archivos, PascalCase para clases, camelCase para identificadores
- **Providers**: nombrar `<algo>Provider` (ej. `expensesProvider`, `currentUserProvider`)
- **Repositories**: una clase por feature, recibe `SupabaseClient` por DI
- **Models**: inmutables, `copyWith` cuando necesite update parcial, `fromJson/toJson` para Supabase
- **Errores**: lanzar excepciones tipadas (`AppException` con subtipos); las UI las atrapan en el provider
- **Idioma**: código en inglés; strings user-facing en español por ahora (sin i18n aún)
- **Tests**: cuatro niveles, todos obligatorios por feature:
  - **Unit** con `flutter_test` (sin binding Flutter) → model + repository (mock SupabaseClient con `mocktail`)
  - **Widget** con `flutter_test` + `ProviderScope` overrides → screens en estados loading/data/error
  - **Golden** con `golden_toolkit` → captura cada screen en light + dark, phone + tablet; baselines en `test/features/<feature>/goldens/`
  - **Integration** con `integration_test` → smoke por feature: boot + navegación + 1 interacción

## Para añadir una feature nueva

1. Crear `lib/features/<feature>/{data,domain,presentation}/`
2. En `domain/`: model + interfaces
3. En `data/`: repository que llama a Supabase (RLS hace el filtro por user)
4. En `presentation/`: providers (Riverpod) + screens + widgets
5. Agregar la ruta en `core/router.dart`
6. Si tabla nueva: crear migration en `04-architecture/db/` (SQL) y aplicarla en Supabase Studio
7. Crear los 4 archivos de test en `test/features/<feature>/` + 1 en `integration_test/`
8. Correr `flutter analyze --no-pub && flutter test` antes de marcar la tarea como hecha

## Out of scope (V1)

- i18n con `flutter_localizations` (lo agregamos cuando haya más de 1 idioma)
- Push notifications
- Offline-first / sync local
- iOS / Desktop (solo Android + Web por ahora)

## Pending manual setup

- [ ] Crear proyecto en [Supabase](https://supabase.com/) y copiar `SUPABASE_URL` + `SUPABASE_ANON_KEY` a `05-build/app/.env`
- [ ] Habilitar Email Auth en Supabase → Authentication → Providers
- [ ] Las migraciones SQL viven en `04-architecture/db/` y se aplican manualmente en Supabase Studio
