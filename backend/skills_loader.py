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
    status: str
    when_to_use: str
    body: str
    filename: str


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
            skill = Skill(
                name=post.get("name", path.stem),
                description=post.get("description", ""),
                status=post.get("status", "active"),
                when_to_use=post.get("when_to_use", ""),
                body=post.content.strip(),
                filename=path.name,
            )
            _cache[key] = (mtime, skill)
            skills.append(skill)
        except Exception:
            continue
    return skills


def build_skill_index(skills: list[Skill]) -> str:
    lines = ["## Available Skills"]
    for s in skills:
        lines.append(f"- **{s.name}**: {s.description} — When to use: {s.when_to_use}")
    lines.append("\nCall get_skill(name) to load a skill's full instructions before responding if one is relevant.")
    return "\n".join(lines)


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
