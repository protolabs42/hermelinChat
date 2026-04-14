"""Skeleton-level provider behavior.

Covers the smallest contract surface: the class can be constructed, names
itself correctly, subclasses the hermes ABC, and the register() entry point
registers an instance with a plugin context.
"""

from __future__ import annotations

from typing import Any

import pytest


def test_provider_class_importable():
    from plugins.memory.chorus import ChorusMemoryProvider

    assert ChorusMemoryProvider is not None


def test_provider_subclasses_memory_provider_abc():
    from agent.memory_provider import MemoryProvider
    from plugins.memory.chorus import ChorusMemoryProvider

    assert issubclass(ChorusMemoryProvider, MemoryProvider)


def test_provider_name_is_chorus():
    from plugins.memory.chorus import ChorusMemoryProvider

    provider = ChorusMemoryProvider()
    assert provider.name == "chorus"


def test_register_entry_point_registers_instance():
    from plugins.memory.chorus import ChorusMemoryProvider, register

    class _Ctx:
        def __init__(self) -> None:
            self.provider: Any = None

        def register_memory_provider(self, provider: Any) -> None:
            self.provider = provider

    ctx = _Ctx()
    register(ctx)
    assert isinstance(ctx.provider, ChorusMemoryProvider)


def test_get_tool_schemas_returns_list():
    from plugins.memory.chorus import ChorusMemoryProvider

    provider = ChorusMemoryProvider()
    schemas = provider.get_tool_schemas()
    assert isinstance(schemas, list)


def test_provider_defaults_are_safe_before_initialize():
    """A freshly constructed provider must not crash from hooks.

    The hermes lifecycle can call system_prompt_block / prefetch / shutdown
    even if initialize() was never reached (e.g. cron guard, bad config).
    """
    from plugins.memory.chorus import ChorusMemoryProvider

    provider = ChorusMemoryProvider()

    assert provider.system_prompt_block() == ""
    assert provider.prefetch("hi") == ""
    provider.queue_prefetch("hi")
    provider.sync_turn("u", "a")
    provider.on_session_end([])
    assert provider.on_pre_compress([]) == ""
    provider.on_memory_write("add", "user", "x")
    provider.shutdown()
