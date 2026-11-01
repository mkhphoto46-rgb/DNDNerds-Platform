def restore_web(previous, current, failed):
    """Restore even if copying the replacement failed before creating its root."""
    assert previous.is_dir(), 'Previous web build is missing'
    assert not failed.exists(), 'Failed-build destination already exists'
    if current.exists(): current.rename(failed)
    previous.rename(current)
