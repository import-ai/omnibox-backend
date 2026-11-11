// Emitted from the Python SnapshotResponse wire model.
export default {
  records: [
    {
      type: 'chunk',
      namespace_id: 'n',
      user_id: 'u',
      chunk: {
        title: '610 title',
        resource_id: 'resource-a',
        text: 'immutable snippet',
        chunk_type: 'doc',
        parent_id: 'root',
        resource_tag_ids: [],
        resource_tag_names: [],
        chunk_id: 'chunk-a',
        created_at: 1794399854.8465579,
        updated_at: 1794399854.8465579,
        start_index: null,
        end_index: null,
        line_range: null,
      },
      message: null,
      _vectors: null,
    },
  ],
  recall_truncated: false,
  relevance_enabled: true,
  policy_signature: 'policy-v1',
};
