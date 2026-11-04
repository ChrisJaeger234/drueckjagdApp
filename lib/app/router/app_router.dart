import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/authentication/presentation/auth_providers.dart';
import '../../features/authentication/presentation/login_screen.dart';
import '../../features/authentication/presentation/register_screen.dart';
import '../../features/authentication/presentation/splash_screen.dart';
import '../../features/chat/presentation/chat_preview_screen.dart';
import '../../features/groups/presentation/create_group_screen.dart';
import '../../features/groups/presentation/edit_group_screen.dart';
import '../../features/groups/presentation/group_detail_screen.dart';
import '../../features/groups/presentation/groups_screen.dart';
import '../../features/groups/presentation/join_group_screen.dart';
import '../../features/hunting_grounds/presentation/revier_detail_screen.dart';
import '../../features/hunting_grounds/presentation/revier_form_screen.dart';
import '../../features/hunts/presentation/hunt_detail_screen.dart';
import '../../features/hunts/presentation/hunt_form_screen.dart';
import '../../features/hunts/presentation/stand_form_screen.dart';
import '../../features/map/presentation/map_preview_screen.dart';
import '../../features/overview/presentation/overview_screen.dart';
import '../../features/profile/presentation/edit_profile_screen.dart';
import '../../features/profile/presentation/profile_screen.dart';
import 'app_shell.dart';
import 'auth_redirect.dart';
import 'routes.dart';

final _rootKey = GlobalKey<NavigatorState>(debugLabel: 'root');

final routerProvider = Provider<GoRouter>((ref) {
  // Der Router wird nur einmal erzeugt; Statuswechsel lösen ein Refresh aus.
  final refresh = ValueNotifier<AuthStatus>(ref.read(authStatusProvider));
  ref.listen<AuthStatus>(authStatusProvider, (_, next) => refresh.value = next);
  ref.onDispose(refresh.dispose);

  final router = GoRouter(
    navigatorKey: _rootKey,
    initialLocation: Routes.splash,
    refreshListenable: refresh,
    redirect: (context, state) => authRedirect(status: refresh.value, location: state.matchedLocation),
    routes: [
      GoRoute(path: Routes.splash, builder: (_, _) => const SplashScreen()),
      GoRoute(path: Routes.login, builder: (_, _) => const LoginScreen()),
      GoRoute(path: Routes.register, builder: (_, _) => const RegisterScreen()),
      // Jagden liegen außerhalb der Tabs (Vollbild), erreichbar aus Übersicht und Gruppe.
      GoRoute(
        path: '/hunts/new',
        builder: (_, s) => HuntFormScreen(groupId: s.uri.queryParameters['group'] ?? ''),
      ),
      GoRoute(
        path: '/hunts/:huntId',
        builder: (_, s) => HuntDetailScreen(huntId: s.pathParameters['huntId']!),
        routes: [
          GoRoute(
            path: 'edit',
            builder: (_, s) => HuntFormScreen.edit(huntId: s.pathParameters['huntId']!),
          ),
          GoRoute(
            path: 'stands/new',
            builder: (_, s) => StandFormScreen(huntId: s.pathParameters['huntId']!),
          ),
          GoRoute(
            path: 'stands/:standId/edit',
            builder: (_, s) =>
                StandFormScreen(huntId: s.pathParameters['huntId']!, standId: s.pathParameters['standId']),
          ),
        ],
      ),
      StatefulShellRoute.indexedStack(
        builder: (_, _, shell) => AppShell(navigationShell: shell),
        branches: [
          StatefulShellBranch(
            routes: [GoRoute(path: Routes.overview, builder: (_, _) => const OverviewScreen())],
          ),
          StatefulShellBranch(
            routes: [GoRoute(path: Routes.map, builder: (_, _) => const MapPreviewScreen())],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.groups,
                builder: (_, _) => const GroupsScreen(),
                routes: [
                  GoRoute(path: 'new', parentNavigatorKey: _rootKey, builder: (_, _) => const CreateGroupScreen()),
                  GoRoute(path: 'join', parentNavigatorKey: _rootKey, builder: (_, _) => const JoinGroupScreen()),
                  GoRoute(
                    path: ':groupId',
                    builder: (_, s) => GroupDetailScreen(groupId: s.pathParameters['groupId']!),
                    routes: [
                      GoRoute(
                        path: 'edit',
                        parentNavigatorKey: _rootKey,
                        builder: (_, s) => EditGroupScreen(groupId: s.pathParameters['groupId']!),
                      ),
                      GoRoute(
                        path: 'reviere/new',
                        parentNavigatorKey: _rootKey,
                        builder: (_, s) => RevierFormScreen(groupId: s.pathParameters['groupId']!),
                      ),
                      GoRoute(
                        path: 'reviere/:revierId',
                        builder: (_, s) => RevierDetailScreen(
                          groupId: s.pathParameters['groupId']!,
                          revierId: s.pathParameters['revierId']!,
                        ),
                        routes: [
                          GoRoute(
                            path: 'edit',
                            parentNavigatorKey: _rootKey,
                            builder: (_, s) => RevierFormScreen(
                              groupId: s.pathParameters['groupId']!,
                              revierId: s.pathParameters['revierId']!,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [GoRoute(path: Routes.chat, builder: (_, _) => const ChatPreviewScreen())],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: Routes.profile,
                builder: (_, _) => const ProfileScreen(),
                routes: [
                  GoRoute(path: 'edit', parentNavigatorKey: _rootKey, builder: (_, _) => const EditProfileScreen()),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
});
