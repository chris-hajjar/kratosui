from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import frontmatter

SKILLS_DIR = Path(__file__).parent / "skills"


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


def load_skills() -> list[Skill]:
    skills = []
    for path in sorted(SKILLS_DIR.glob("*.md")):
        try:
            post = frontmatter.load(str(path))
            skills.append(
                Skill(
                    name=post.get("name", path.stem),
                    description=post.get("description", ""),
                    category=post.get("category", "General"),
                    icon=post.get("icon", "🔧"),
                    status=post.get("status", "active"),
                    triggers=post.get("triggers", []),
                    body=post.content.strip(),
                    filename=path.name,
                )
            )
        except Exception:
            continue
    return skills


def match_skill(message: str, skills: list[Skill]) -> Skill | None:
    msg = message.lower()
    for skill in skills:
        if skill.status != "active":
            continue
        if any(t.lower() in msg for t in skill.triggers):
            return skill
    return None


def save_skill(filename: str, data: dict) -> None:
    """Write a skill back to disk from structured data."""
    post = frontmatter.Post(
        content=data.get("body", ""),
        **{k: v for k, v in data.items() if k != "body"},
    )
    path = SKILLS_DIR / filename
    with open(path, "w") as f:
        f.write(frontmatter.dumps(post))


def delete_skill(filename: str) -> None:
    path = SKILLS_DIR / filename
    if path.exists():
        path.unlink()
