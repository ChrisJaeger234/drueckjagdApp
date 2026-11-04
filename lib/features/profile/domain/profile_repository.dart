import 'profile.dart';

abstract interface class ProfileRepository {
  Future<Profile> fetchProfile(String userId);

  Future<Profile> updateProfile({required String userId, required String username, required String displayName});
}
