import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// Complete 25-screen GoRouter map for CrossCall (Android, iOS, Web).
final appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/splash',
    routes: [
      GoRoute(path: '/splash', builder: (_, __) => const _RouteStub('Splash')),
      GoRoute(path: '/onboarding', builder: (_, __) => const _RouteStub('Onboarding')),
      GoRoute(path: '/login', builder: (_, __) => const _RouteStub('Login')),
      GoRoute(path: '/register', builder: (_, __) => const _RouteStub('Register')),
      GoRoute(path: '/otp-verify', builder: (_, __) => const _RouteStub('OTP Verification')),
      GoRoute(path: '/email-verify', builder: (_, __) => const _RouteStub('Email Verification')),
      GoRoute(path: '/forgot-password', builder: (_, __) => const _RouteStub('Forgot Password')),
      GoRoute(path: '/home', builder: (_, __) => const _RouteStub('Home')),
      GoRoute(path: '/contacts', builder: (_, __) => const _RouteStub('Contacts')),
      GoRoute(path: '/search', builder: (_, __) => const _RouteStub('Search Users')),
      GoRoute(path: '/profile/:id', builder: (_, state) => _RouteStub('Profile ${state.pathParameters['id']}')),
      GoRoute(path: '/call/incoming/:callId', builder: (_, __) => const _RouteStub('Incoming Call')),
      GoRoute(path: '/call/outgoing/:callId', builder: (_, __) => const _RouteStub('Outgoing Call')),
      GoRoute(path: '/call/audio/:roomId', builder: (_, __) => const _RouteStub('Active Audio Call')),
      GoRoute(path: '/call/video/:roomId', builder: (_, __) => const _RouteStub('Active Video Call')),
      GoRoute(path: '/call/group/:roomId', builder: (_, __) => const _RouteStub('Group Call')),
      GoRoute(path: '/history', builder: (_, __) => const _RouteStub('Call History')),
      GoRoute(path: '/notifications', builder: (_, __) => const _RouteStub('Notifications')),
      GoRoute(path: '/settings', builder: (_, __) => const _RouteStub('Settings')),
      GoRoute(path: '/settings/privacy', builder: (_, __) => const _RouteStub('Privacy Settings')),
      GoRoute(path: '/settings/blocked', builder: (_, __) => const _RouteStub('Blocked Users')),
      GoRoute(path: '/settings/devices', builder: (_, __) => const _RouteStub('Device Management')),
      GoRoute(path: '/settings/language', builder: (_, __) => const _RouteStub('Language Settings')),
      GoRoute(path: '/settings/media', builder: (_, __) => const _RouteStub('Audio & Video Settings')),
      GoRoute(path: '/meet/:roomId', builder: (_, __) => const _RouteStub('Web Meeting Screen')),
    ],
  );
});

class _RouteStub extends StatelessWidget {
  final String title;
  const _RouteStub(this.title);
  @override
  Widget build(BuildContext context) => Scaffold(appBar: AppBar(title: Text(title)));
}
