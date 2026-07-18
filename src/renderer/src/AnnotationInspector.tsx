import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AnnotationPurpose, SourceAnnotation } from "../../shared/learning-application";

interface AnnotationInspectorProps {
  anchorLabel: string;
  annotations: SourceAnnotation[];
  initialPurpose: AnnotationPurpose;
  onCreate(purpose: AnnotationPurpose, content: string): Promise<void>;
  onConvert(annotationId: string, purpose: AnnotationPurpose): Promise<void>;
  onClose(): void;
}

export function AnnotationInspector({
  anchorLabel,
  annotations,
  initialPurpose,
  onCreate,
  onConvert,
  onClose
}: AnnotationInspectorProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [purpose, setPurpose] = useState(initialPurpose);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPurpose(initialPurpose);
    closeRef.current?.focus();
  }, [initialPurpose, anchorLabel]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!content.trim()) return;
    setBusy(true);
    try {
      await onCreate(purpose, content.trim());
      setContent("");
    } finally {
      setBusy(false);
    }
  };
  const convert = async (annotation: SourceAnnotation) => {
    setBusy(true);
    try {
      await onConvert(annotation.id, otherPurpose(annotation.purpose));
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="contextual-inspector annotation-inspector" aria-label={`Annotations for ${anchorLabel}`}>
      <div className="card-heading">
        <div><p className="eyebrow">Contextual Inspector</p><h2>Source annotations</h2></div>
        <button ref={closeRef} className="text-button" aria-label="Close Annotation Inspector" onClick={onClose}>Close</button>
      </div>
      <p className="record-link">Attached to {anchorLabel}</p>
      {annotations.map((annotation) => (
        <article className="source-annotation" aria-label={purposeLabel(annotation.purpose)} key={annotation.id}>
          <div className="card-heading">
            <h3>{purposeLabel(annotation.purpose)}</h3>
            <span className="saved">Anchored</span>
          </div>
          <p className="annotation-verbatim">{annotation.content}</p>
          {annotation.purposeChangedFrom && (
            <p className="annotation-purpose-change" role="status">
              Changed from {purposeLabel(annotation.purposeChangedFrom)}. Future use follows the current purpose.
            </p>
          )}
          <button className="secondary" disabled={busy} onClick={() => void convert(annotation)}>
            Convert {purposeLabel(annotation.purpose)} to {purposeLabel(otherPurpose(annotation.purpose))}
          </button>
        </article>
      ))}
      <form className="inspector-form" onSubmit={(event) => void submit(event)}>
        <fieldset>
          <legend>Annotation purpose</legend>
          <label><input type="radio" name="annotation-purpose" value="personalNote"
            checked={purpose === "personalNote"} onChange={() => setPurpose("personalNote")} /> Personal Note</label>
          <label><input type="radio" name="annotation-purpose" value="tutorFeedback"
            checked={purpose === "tutorFeedback"} onChange={() => setPurpose("tutorFeedback")} /> Tutor Feedback</label>
        </fieldset>
        <p className="subtle">{purpose === "personalNote"
          ? "Personal Notes stay local and are excluded from ordinary Teaching Moves."
          : "Tutor Feedback guides later Teaching Moves and may revise the current Teaching Card."}</p>
        <label htmlFor="source-annotation-content">{purposeLabel(purpose)}</label>
        <textarea id="source-annotation-content" value={content} disabled={busy}
          onChange={(event) => setContent(event.target.value)} />
        <button className="primary" disabled={busy || !content.trim()}>Save {purposeLabel(purpose)}</button>
      </form>
    </aside>
  );
}

function purposeLabel(purpose: AnnotationPurpose): string {
  return purpose === "personalNote" ? "Personal Note" : "Tutor Feedback";
}

function otherPurpose(purpose: AnnotationPurpose): AnnotationPurpose {
  return purpose === "personalNote" ? "tutorFeedback" : "personalNote";
}
