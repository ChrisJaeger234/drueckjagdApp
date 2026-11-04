import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServices } from '../../app/services';
import { useUser } from '../auth/AuthContext';
import type { Profile } from './profileService';

export const profileKey = (userId: string) => ['profile', userId] as const;

export function useProfile() {
  const { profiles } = useServices();
  const user = useUser();
  return useQuery({ queryKey: profileKey(user.id), queryFn: () => profiles.fetch(user.id) });
}

export function useAvatarUrl(path: string | null | undefined) {
  const { profiles } = useServices();
  return useQuery({
    queryKey: ['avatar-url', path],
    queryFn: () => profiles.avatarUrl(path!),
    enabled: !!path,
    staleTime: 50 * 60 * 1000, // signierte URL gilt 60 Minuten
  });
}

export function useUpdateProfile() {
  const { profiles } = useServices();
  const user = useUser();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { username: string; displayName: string }) => profiles.update(user.id, input),
    onSuccess: (profile: Profile) => client.setQueryData(profileKey(user.id), profile),
  });
}

export function useUploadAvatar() {
  const { profiles } = useServices();
  const user = useUser();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (file: Blob) => profiles.uploadAvatar(user.id, file),
    onSuccess: (profile: Profile) => client.setQueryData(profileKey(user.id), profile),
  });
}
