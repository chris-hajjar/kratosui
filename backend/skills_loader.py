from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import frontmatter

SKILLS_DIR = Path(__file__).parent / "skills"

# mtime-based cache: path -> (mtime, Skill)
_cache: dict[str, tuple[float, "Skill"]] = {}


@dataclass
class Skill:
    name: str
    description: str
    category: str
    icon: str
    status: str
    triggers: list[str]
    body: str
    filename: str
    persist: bool = False


def load_skills() -> list[Skill]:
    skills = []
    for path in sorted(SKILLS_DIR.glob("*.md")):
        key = str(path)
        try:
            mtime = path.stat().st_mtime
            if key in _cache and _cache[key][0] == mtime:
                skills.append(_cache[key][1])
                continue
            post = frontmatter.load(str(path))
            persist_val = post.get("persist", False)
            skill = Skill(
                name=post.get("name", path.stem),
                description=post.get("description", ""),
                category=post.get("category", "General"),
                icon=post.get("icon", "🔧"),
                status=post.get("status", "active"),
                triggers=post.get("triggers", []),
                body=post.content.strip(),
                filename=path.name,
                persist=persist_val is not False,
            )
            _cache[key] = (mtime, skill)
            skills.append(skill)
        except Exception:
            continue
    return skills


def match_skills(message: str, skills: list[Skill]) -> list[Skill]:
    msg = message.lower()
    return [
        s for s in skills
        if s.status == "active" and any(t.lower() in msg for t in s.triggers)
    ]


def get_skills_by_name(names: list[str], all_skills: list[Skill]) -> list[Skill]:
    name_set = set(names)
    return [s for s in all_skills if s.name in name_set]


def save_skill(filename: str, data: dict) -> None:
    """Write a skill back to disk from structured data."""
    post = frontmatter.Post(
        content=data.get("body", ""),
        **{k: v for k, v in data.items() if k != "body"},
    )
    path = SKILLS_DIR / filename
    with open(path, "w") as f:
        f.write(frontmatter.dumps(post))
    # Invalidate cache entry so next load picks up changes
    _cache.pop(str(path), None)


def delete_skill(filename: str) -> None:
    path = SKILLS_DIR / filename
    if path.exists():
        path.unlink()
    _cache.pop(str(path), None)
