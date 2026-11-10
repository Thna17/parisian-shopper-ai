import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { postsApi, type PostInput, type StaffPost } from './api/posts-api.js';
export function useCreatePost(): UseMutationResult<StaffPost, Error, PostInput> {
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (input: PostInput) => postsApi.create(input),
    onSuccess: async (post) => {
      cache.setQueryData(['staff-post', post.id], post);
      await cache.invalidateQueries({ queryKey: ['staff-posts'] });
    },
  });
}
