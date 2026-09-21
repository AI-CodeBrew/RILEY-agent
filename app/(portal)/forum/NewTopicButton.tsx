"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { Field, SelectField, TextareaField } from "@/components/Field";
import { useToast } from "@/components/Toast";
import { FORUM_CATEGORIES, FORUM_CATEGORY_LABELS } from "@/lib/forum-category";
import type { ForumCategory } from "@/types/database";

export function NewTopicButton() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<ForumCategory>("general");

  async function handleSubmit() {
    setPosting(true);

    const res = await fetch("/api/forum/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, category }),
    });
    const data = await res.json().catch(() => ({}));

    setPosting(false);

    if (!res.ok) {
      toast(data.error ?? "Could not post that topic.", "error");
      return;
    }

    setOpen(false);
    setTitle("");
    setBody("");
    setCategory("general");
    toast("Topic posted.", "success");
    if (data.topic?.id) {
      router.push(`/forum/${data.topic.id}`);
    } else {
      router.refresh();
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        New topic
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Start a new topic"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={posting}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              loading={posting}
              disabled={!title.trim() || !body.trim()}
            >
              Post topic
            </Button>
          </>
        }
      >
        <Field
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What do you want to discuss?"
          autoFocus
        />
        <SelectField
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value as ForumCategory)}
        >
          {FORUM_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {FORUM_CATEGORY_LABELS[c]}
            </option>
          ))}
        </SelectField>
        <TextareaField
          label="Message"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Details, context, questions…"
          rows={5}
        />
      </Modal>
    </>
  );
}
