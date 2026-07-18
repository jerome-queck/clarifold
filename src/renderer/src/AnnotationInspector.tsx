import { useEffect, useRef, useState, type FormEvent } from "react";
import { annotationPurposeLabel, type AnnotationPurpose, type SourceAnnotation } from "../../shared/annotations";

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPurpose(initialPurpose);
    setError(null);
    closeRef.current?.focus();
  }, [initialPurpose, anchorLabel]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!content.trim()) return;
    setBusy(true);
    try {
      await onCreate(purpose, content);
      setContent("");
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The annotation could not be saved.");
    } finally {
      setBusy(false);
    }
  };
  const convert = async (annotation: SourceAnnotation) => {
    setBusy(true);
    try {
      await onConvert(annotation.id, otherPurpose(annotation.purpose));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The annotation purpose could not be changed.");
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
        <article className="source-annotation" aria-label={annotationPurposeLabel(annotation.purpose)} key={annotation.id}>
          <div className="card-heading">
            <h3>{annotationPurposeLabel(annotation.purpose)}</h3>
            <span className="saved">Anchored</span>
          </div>
          <p className="annotation-verbatim">{annotation.content}</p>
          {annotation.purposeChanges.length > 0 && <ol className="annotation-purpose-change" aria-label="Annotation purpose change history">
            {annotation.purposeChanges.map((change, index) => <li key={`${change.from}-${change.to}-${index}`}>
              Changed from {annotationPurposeLabel(change.from)} to {annotationPurposeLabel(change.to)}.
            </li>)}
          </ol>}
          <button className="secondary" disabled={busy} onClick={() => void convert(annotation)}>
            Convert {annotationPurposeLabel(annotation.purpose)} to {annotationPurposeLabel(otherPurpose(annotation.purpose))}
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
        <label htmlFor="source-annotation-content">{annotationPurposeLabel(purpose)}</label>
        <textarea id="source-annotation-content" value={content} disabled={busy}
          onChange={(event) => setContent(event.target.value)} />
        <button className="primary" disabled={busy || !content.trim()}>Save {annotationPurposeLabel(purpose)}</button>
      </form>
      {error && <p className="failure-message" role="alert">{error}</p>}
    </aside>
  );
}

function otherPurpose(purpose: AnnotationPurpose): AnnotationPurpose {
  return purpose === "personalNote" ? "tutorFeedback" : "personalNote";
}
